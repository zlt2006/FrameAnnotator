from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import zipfile
import shutil

import cv2
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


def save_label(session_id: str, frame_name: str, bbox: Dict[str, Any], label: int) -> Optional[Dict[str, Any]]:
    data = load_labels(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="未找到 session 标签文件")

    _validate_label(label)
    _validate_bbox(bbox)

    frames = data.setdefault("frames", [])
    existing = next((frame for frame in frames if frame.get("frame_name") == frame_name), None)
    if existing is None:
        raise HTTPException(status_code=404, detail="帧未在当前 session 中注册")

    crop_name = existing.get("crop_name")
    if not crop_name:
        crop_name = f"{config.CROP_PREFIX}{frames.index(existing)+1:05d}.jpg"

    crop_path = _crop_and_save(session_id=session_id, frame_name=frame_name, bbox=bbox, crop_name=crop_name)

    existing.update(
        {
            "labeled": True,
            "label": label,
            "crop_name": crop_name,
            "bbox": bbox,
        }
    )
    utils.write_json(labels_path(session_id), data)
    return {"success": True, "crop_image": crop_path.name}


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


def _validate_bbox(bbox: Dict[str, Any]) -> None:
    required = {"x", "y", "width", "height"}
    if not all(k in bbox for k in required):
        raise HTTPException(status_code=400, detail="bbox 缺少必要字段")
    if any(not isinstance(bbox[k], (int, float)) for k in required):
        raise HTTPException(status_code=400, detail="bbox 字段需为数字")
    if bbox["width"] <= 0 or bbox["height"] <= 0:
        raise HTTPException(status_code=400, detail="bbox 宽高需大于 0")


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

    # 防止越界
    if x + w > max_width:
        w = max_width - x
    if y + h > max_height:
        h = max_height - y

    if w <= 0 or h <= 0:
        raise HTTPException(status_code=400, detail="裁剪框超出图片范围")
    return x, y, w, h


def get_export_path(session_id: str) -> Path:
    return config.LABELS_DIR / f"{session_id}{config.EXPORT_SUFFIX}"


def export_dataset(session_id: str) -> Optional[Path]:
    data = load_labels(session_id)
    if data is None:
        return None

    frames = data.get("frames", [])
    export_path = get_export_path(session_id)
    export_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(export_path, "w") as archive:
        label_lines = []
        for frame in frames:
            if frame.get("labeled") and "crop_name" in frame and "label" in frame:
                crop_name = frame["crop_name"]
                label_lines.append(f"{crop_name};{frame['label']}")
                crop_path = config.CROPS_DIR / session_id / crop_name
                if crop_path.exists():
                    archive.write(crop_path, arcname=crop_name)
        archive.writestr("labels.txt", "\n".join(label_lines))
    return export_path


def reset_labels(session_id: str) -> bool:
    data = load_labels(session_id)
    if data is None:
        return False

    frames = data.get("frames", [])
    for frame in frames:
        frame["labeled"] = False
        frame.pop("label", None)
        frame.pop("crop_name", None)
        frame.pop("bbox", None)

    # remove existing crops and export artifacts
    shutil.rmtree(config.CROPS_DIR / session_id, ignore_errors=True)
    export_path = get_export_path(session_id)
    export_path.unlink(missing_ok=True)

    utils.write_json(labels_path(session_id), data)
    return True
