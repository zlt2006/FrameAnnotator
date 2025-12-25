import json
import math
import shutil
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from fastapi import HTTPException

from app.core import config, utils


def labels_path(session_id: str) -> Path:
    return config.LABELS_DIR / f"{session_id}.json"


def initialize_session(session_id: str, fps: int, frames: Optional[List[str]] = None) -> Dict[str, Any]:
    payload = {
        "session_id": session_id,
        "fps": fps,
        "frames": [{"frame_name": name, "labeled": False} for name in frames or []],
    }
    utils.write_json(labels_path(session_id), payload)
    return payload


def load_labels(session_id: str) -> Optional[Dict[str, Any]]:
    return utils.read_json(labels_path(session_id))


def save_label(
    session_id: str,
    frame_name: str,
    boxes: Dict[str, Any],
    label: int,
    hand_label: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    data = load_labels(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="??? session ????")

    _validate_label(label)
    if hand_label is not None:
        _validate_hand_label(hand_label)

    if not isinstance(boxes, dict):
        raise HTTPException(status_code=400, detail="boxes ????")

    required = {"head", "left_hand", "right_hand"}
    if not required.issubset(boxes.keys()):
        raise HTTPException(status_code=400, detail="boxes ??????")

    _validate_bbox(boxes["head"])
    _validate_bbox(boxes["left_hand"])
    _validate_bbox(boxes["right_hand"])

    head_box = _cast_bbox(boxes["head"])
    left_box = _cast_bbox(boxes["left_hand"])
    right_box = _cast_bbox(boxes["right_hand"])

    keypoints = _boxes_to_keypoints(head_box, left_box, right_box)
    relative_pose = _compute_relative_pose(keypoints, head_box)

    frames = data.setdefault("frames", [])
    existing = next((frame for frame in frames if frame.get("frame_name") == frame_name), None)
    if existing is None:
        raise HTTPException(status_code=404, detail="????? session ???")

    existing.update(
        {
            "labeled": True,
            "label": label,
            "hand_label": hand_label,
            "head_box": head_box,
            "left_hand_box": left_box,
            "right_hand_box": right_box,
            "keypoints": keypoints,
            "relative_pose": relative_pose,
        }
    )
    utils.write_json(labels_path(session_id), data)
    return {"success": True}



def get_summary(session_id: str) -> Optional[Dict[str, Any]]:
    data = load_labels(session_id)
    if data is None:
        return None
    frames = data.get("frames", [])
    labeled_frames = [f for f in frames if f.get("labeled")]
    return {
        "total_frames": len(frames),
        "labeled_frames": len(labeled_frames),
        "detail": frames,
    }


def _validate_label(label: int) -> None:
    if label not in {1, 2, 3, 4, 5}:
        raise HTTPException(status_code=400, detail="label 需为 1-5 的整数")


def _validate_hand_label(label: int) -> None:
    if label not in {1, 2, 3, 4, 5}:
        raise HTTPException(status_code=400, detail="hand_label 需为 1-5 的整数")


def _validate_bbox(bbox: Dict[str, Any]) -> None:
    required = {"x", "y", "width", "height"}
    if not all(k in bbox for k in required):
        raise HTTPException(status_code=400, detail="bbox 缺少必要字段")
    if any(not isinstance(bbox[k], (int, float)) for k in required):
        raise HTTPException(status_code=400, detail="bbox 字段需为数字")
    if bbox["width"] <= 0 or bbox["height"] <= 0:
        raise HTTPException(status_code=400, detail="bbox 宽高需大于 0")


def _cast_bbox(bbox: Dict[str, Any]) -> Dict[str, int]:
    return {
        "x": int(bbox["x"]),
        "y": int(bbox["y"]),
        "width": int(bbox["width"]),
        "height": int(bbox["height"]),
    }


def _boxes_to_keypoints(
    head_box: Dict[str, Any],
    left_box: Dict[str, Any],
    right_box: Dict[str, Any],
) -> Dict[str, Dict[str, float]]:
    def _center(box: Dict[str, Any]) -> Dict[str, float]:
        return {
            "x": float(box["x"]) + float(box["width"]) / 2,
            "y": float(box["y"]) + float(box["height"]) / 2,
        }

    return {
        "head": _center(head_box),
        "left_hand": _center(left_box),
        "right_hand": _center(right_box),
    }


def _compute_relative_pose(keypoints: Dict[str, Any], bbox: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
    w = float(bbox["width"])
    h = float(bbox["height"])
    if w <= 0 or h <= 0:
        raise HTTPException(status_code=400, detail="bbox 宽高需大于 0")

    def _norm(pt: Dict[str, Any]) -> Dict[str, float]:
        return {
            "x": round(max(0.0, min(1.0, (float(pt["x"]) - float(bbox["x"])) / w)), 6),
            "y": round(max(0.0, min(1.0, (float(pt["y"]) - float(bbox["y"])) / h)), 6),
        }

    return {name: _norm(pt) for name, pt in keypoints.items() if pt is not None}


def _crop_and_save(session_id: str, frame_name: str, bbox: Dict[str, Any], crop_name: str) -> Path:
    frame_path = config.FRAMES_DIR / session_id / frame_name
    if not frame_path.exists():
        raise HTTPException(status_code=404, detail="原始帧不存在")

    image = cv2.imread(str(frame_path))
    if image is None:
        raise HTTPException(status_code=500, detail="无法读取原始帧")

    x, y, w, h = _clamp_bbox(bbox, image.shape[1], image.shape[0])
    crop = image[y : y + h, x : x + w]
    resized = cv2.resize(crop, config.DEFAULT_CROP_SIZE)

    crop_dir = config.CROPS_DIR / session_id
    crop_dir.mkdir(parents=True, exist_ok=True)
    crop_path = crop_dir / crop_name
    cv2.imwrite(str(crop_path), resized)
    return crop_path


def _clamp_bbox(bbox: Dict[str, Any], max_width: int, max_height: int) -> Tuple[int, int, int, int]:
    x = max(0, int(bbox["x"]))
    y = max(0, int(bbox["y"]))
    w = int(bbox["width"])
    h = int(bbox["height"])

    if x + w > max_width:
        w = max_width - x
    if y + h > max_height:
        h = max_height - y

    if w <= 0 or h <= 0:
        raise HTTPException(status_code=400, detail="裁剪框超过图片范围")
    return x, y, w, h


def _fit_bbox_within(bbox: Dict[str, Any], max_width: int, max_height: int) -> Tuple[int, int, int, int]:
    x = int(bbox["x"])
    y = int(bbox["y"])
    w = int(bbox["width"])
    h = int(bbox["height"])

    if w <= 0 or h <= 0:
        raise HTTPException(status_code=400, detail="bbox 宽高需大于 0")

    w = min(w, max_width)
    h = min(h, max_height)

    x = max(0, min(x, max_width - w))
    y = max(0, min(y, max_height - h))

    return x, y, w, h


def _crop_from_image(image: Any, bbox: Dict[str, Any]) -> Any:
    x, y, w, h = _fit_bbox_within(bbox, image.shape[1], image.shape[0])
    return image[y : y + h, x : x + w]


def _encode_jpg(image: Any) -> bytes:
    ok, buffer = cv2.imencode(".jpg", image)
    if not ok:
        raise HTTPException(status_code=500, detail="图片编码失败")
    return buffer.tobytes()


def _concat_hands(left: Any, right: Any) -> Any:
    height = max(left.shape[0], right.shape[0])
    width = left.shape[1] + right.shape[1]
    canvas = np.zeros((height, width, 3), dtype=left.dtype)
    canvas[0 : left.shape[0], 0 : left.shape[1]] = left
    canvas[0 : right.shape[0], left.shape[1] : left.shape[1] + right.shape[1]] = right
    return canvas


def get_export_path(session_id: str) -> Path:
    return config.LABELS_DIR / f"{session_id}{config.EXPORT_SUFFIX}"


def export_dataset(session_id: str) -> Optional[Path]:
    data = load_labels(session_id)
    if data is None:
        return None

    frames = data.get("frames", [])
    export_path = get_export_path(session_id)
    export_path.parent.mkdir(parents=True, exist_ok=True)

    head_records: List[Dict[str, Any]] = []
    hand_records: List[Dict[str, Any]] = []
    head_index = 1
    hand_index = 1

    with zipfile.ZipFile(export_path, "w") as archive:
        for frame in frames:
            if not frame.get("labeled"):
                continue

            frame_name = frame.get("frame_name")
            head_box = frame.get("head_box")
            left_box = frame.get("left_hand_box")
            right_box = frame.get("right_hand_box")
            if not frame_name or not head_box or not left_box or not right_box:
                continue

            label_value = frame.get("label")
            hand_label_value = frame.get("hand_label")
            if label_value is None or hand_label_value is None:
                continue

            frame_path = config.FRAMES_DIR / session_id / frame_name
            if not frame_path.exists():
                continue

            image = cv2.imread(str(frame_path))
            if image is None:
                continue

            head_crop = _crop_from_image(image, head_box)
            head_name = f"head_{head_index:05d}.jpg"
            archive.writestr(
                f"data/head_pose/images/{head_name}",
                _encode_jpg(head_crop),
            )
            head_records.append({"image": head_name, "label": label_value})
            head_index += 1

            left_crop = _crop_from_image(image, left_box)
            right_crop = _crop_from_image(image, right_box)
            hand_crop = _concat_hands(left_crop, right_crop)
            hand_name = f"hand_{hand_index:05d}.jpg"
            archive.writestr(
                f"data/hand_pose/images/{hand_name}",
                _encode_jpg(hand_crop),
            )
            hand_records.append({"image": hand_name, "label": hand_label_value})
            hand_index += 1

        archive.writestr("data/head_pose/labels.json", json.dumps(head_records, ensure_ascii=False, indent=2))
        archive.writestr("data/hand_pose/labels.json", json.dumps(hand_records, ensure_ascii=False, indent=2))

    return export_path



def reset_labels(session_id: str) -> bool:
    data = load_labels(session_id)
    if data is None:
        return False

    frames = data.get("frames", [])
    for frame in frames:
        frame["labeled"] = False
        frame.pop("label", None)
        frame.pop("hand_label", None)
        frame.pop("head_box", None)
        frame.pop("left_hand_box", None)
        frame.pop("right_hand_box", None)
        frame.pop("bbox", None)
        frame.pop("crop_name", None)
        frame.pop("keypoints", None)
        frame.pop("relative_pose", None)
        frame.pop("detection_boxes", None)

    shutil.rmtree(config.CROPS_DIR / session_id, ignore_errors=True)
    get_export_path(session_id).unlink(missing_ok=True)
    det_export_path = config.LABELS_DIR / f"{session_id}{config.DET_EXPORT_SUFFIX}"
    det_export_path.unlink(missing_ok=True)

    utils.write_json(labels_path(session_id), data)
    return True


def save_detections(
    session_id: str, frame_name: str, detections: List[Dict[str, Any]], saved: bool = False
) -> Optional[Dict[str, Any]]:
    data = load_labels(session_id)
    if data is None:
        return None

    frames = data.setdefault("frames", [])
    existing = next((frame for frame in frames if frame.get("frame_name") == frame_name), None)
    if existing is None:
        existing = {"frame_name": frame_name}
        frames.append(existing)

    valid_dets = []
    skipped = 0
    for det in detections:
        try:
            def _val(key: str) -> Any:
                if isinstance(det, dict):
                    return det.get(key)
                return getattr(det, key, None)

            x = float(_val("x"))
            y = float(_val("y"))
            size = float(_val("box_size"))
            w = float(_val("image_width"))
            h = float(_val("image_height"))
        except Exception:  # noqa: BLE001
            skipped += 1
            continue

        if not all(math.isfinite(v) for v in (x, y, size, w, h)):
            skipped += 1
            continue

        if size <= 0 or w <= 0 or h <= 0:
            skipped += 1
            continue

        x_center = x / w
        y_center = y / h
        width_rel = size / w
        height_rel = size / h

        valid_dets.append(
            {
                "x": x,
                "y": y,
                "box_size": size,
                "image_width": w,
                "image_height": h,
                "x_center": x_center,
                "y_center": y_center,
                "width": width_rel,
                "height": height_rel,
            }
        )

    existing["detection_boxes"] = valid_dets
    existing["detection_saved"] = saved and bool(valid_dets)
    utils.write_json(labels_path(session_id), data)

    message = None
    if saved and not valid_dets:
        message = "无有效选框，未计入导出"
    elif skipped:
        message = f"忽略 {skipped} 个无效框"

    return {"success": True, "count": len(valid_dets), "saved": existing["detection_saved"], "message": message}


def export_detections(session_id: str) -> Optional[Path]:
    data = load_labels(session_id)
    if data is None:
        return None

    frames = data.get("frames", [])
    export_path = config.LABELS_DIR / f"{session_id}{config.DET_EXPORT_SUFFIX}"
    export_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(export_path, "w") as archive:
        for frame in frames:
            frame_name = frame.get("frame_name")
            if not frame_name:
                continue
            frame_path = config.FRAMES_DIR / session_id / frame_name
            if not frame.get("detection_saved"):
                continue

            if frame_path.exists():
                archive.write(frame_path, arcname=f"images/{frame_name}")

            dets: List[Dict[str, Any]] = frame.get("detection_boxes") or []
            label_lines = []
            for det in dets:
                x_center = det.get("x_center")
                y_center = det.get("y_center")
                width = det.get("width")
                height = det.get("height")
                if None in (x_center, y_center, width, height):
                    continue
                label_lines.append(f"0 {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
            label_name = frame_name.rsplit(".", 1)[0] + ".txt"
            archive.writestr(f"labels/{label_name}", "\n".join(label_lines))

    return export_path
