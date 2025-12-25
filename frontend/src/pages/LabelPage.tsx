import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import apiClient from "../api/client";
import ImageCropper, { BBox, Point } from "../components/ImageCropper";

type FrameMeta = {
  labeled?: boolean;
  label?: number;
  hand_label?: number;
  head_box?: BBox;
  left_hand_box?: BBox;
  right_hand_box?: BBox;
  keypoints?: Keypoints | null;
  relative_pose?: RelativePose | null;
};

type Keypoints = {
  head?: Point;
  left_hand?: Point;
  right_hand?: Point;
};

type RelativePose = {
  head?: Point;
  left_hand?: Point;
  right_hand?: Point;
};

type PoseBoxes = {
  head: BBox;
  left_hand: BBox;
  right_hand: BBox;
};

const POINT_SEQUENCE: Array<keyof Keypoints> = ["head", "left_hand", "right_hand"];
const POINT_LABELS: Record<keyof Keypoints, string> = {
  head: "头部",
  left_hand: "左手",
  right_hand: "右手",
};

const MIN_BOX_SIZE = 16;

const styles = {
  pageContainer: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    flexDirection: "column" as const,
    backgroundColor: "#ffffff",
    color: "#1a1a1a",
    fontFamily: '"Inter", "Helvetica Neue", sans-serif',
    overflow: "hidden",
  },
  header: {
    height: "64px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 32px",
    borderBottom: "1px solid #e5e5e5",
    backgroundColor: "#ffffff",
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: '"Playfair Display", serif',
    fontSize: "1.25rem",
    fontWeight: 600,
    color: "#111",
    letterSpacing: "-0.02em",
  },
  headerActions: {
    display: "flex",
    gap: "16px",
    alignItems: "center",
  },
  mainWorkspace: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  canvasArea: {
    flex: 1,
    backgroundColor: "#f9f9f9",
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  sidebar: {
    width: "320px",
    backgroundColor: "#ffffff",
    borderLeft: "1px solid #e5e5e5",
    display: "flex",
    flexDirection: "column" as const,
    padding: "32px 24px",
    gap: "32px",
    boxShadow: "-5px 0 20px rgba(0,0,0,0.02)",
    overflowY: "auto" as const,
  },
  filmstripContainer: {
    height: "100px",
    borderTop: "1px solid #e5e5e5",
    backgroundColor: "#ffffff",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "0 24px",
    overflowX: "auto" as const,
    whiteSpace: "nowrap" as const,
  },
  button: {
    padding: "8px 16px",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    backgroundColor: "transparent",
    fontSize: "0.85rem",
    cursor: "pointer",
    transition: "all 0.2s ease",
    fontWeight: 500,
  },
  primaryButton: {
    backgroundColor: "#111",
    color: "#fff",
    border: "1px solid #111",
  },
  ghostButton: {
    border: "none",
    color: "#666",
  },
  labelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "12px",
  },
  labelBtn: {
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #eee",
    borderRadius: "8px",
    fontSize: "1.2rem",
    cursor: "pointer",
    backgroundColor: "#fff",
    transition: "all 0.2s",
  },
  activeLabelBtn: {
    backgroundColor: "#111",
    color: "#fff",
    borderColor: "#111",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },
  thumb: {
    height: "70px",
    width: "auto",
    borderRadius: "4px",
    border: "2px solid transparent",
    cursor: "pointer",
    opacity: 0.7,
    transition: "all 0.2s",
  },
  thumbActive: {
    borderColor: "#111",
    opacity: 1,
    transform: "scale(1.05)",
  },
  statusText: {
    fontSize: "0.75rem",
    color: "#888",
    marginTop: "8px",
    textAlign: "center" as const,
  },
  sectionTitle: {
    fontSize: "0.75rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: "#999",
    marginBottom: "16px",
    fontWeight: 600,
  },
};

function LabelPage() {
  const { sessionId } = useParams();
  const [frames, setFrames] = useState<string[]>([]);
  const [frameMeta, setFrameMeta] = useState<Record<string, FrameMeta>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedLabel, setSelectedLabel] = useState<number | null>(null);
  const [selectedHandLabel, setSelectedHandLabel] = useState<number | null>(null);
  const [headBox, setHeadBox] = useState<BBox | null>(null);
  const [leftHandBox, setLeftHandBox] = useState<BBox | null>(null);
  const [rightHandBox, setRightHandBox] = useState<BBox | null>(null);
  const [keypoints, setKeypoints] = useState<Keypoints | null>(null);
  const [pointMode, setPointMode] = useState<boolean>(true);
  const [nextPointIndex, setNextPointIndex] = useState<number>(0);
  const [headPreviewUrl, setHeadPreviewUrl] = useState<string | null>(null);
  const [leftHandPreviewUrl, setLeftHandPreviewUrl] = useState<string | null>(null);
  const [rightHandPreviewUrl, setRightHandPreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [boxSizeInput, setBoxSizeInput] = useState<string>("128");
  const [boxSize, setBoxSize] = useState<number | null>(128);
  const [boxSizeInvalid, setBoxSizeInvalid] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [filterUnlabeled, setFilterUnlabeled] = useState<boolean>(false);
  const [inheritEnabled, setInheritEnabled] = useState<boolean>(false);
  const lastBoxesRef = useRef<PoseBoxes | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const normalizeFrameName = (frame: any): string | null => {
    if (!frame) return null;
    return frame.frame_name || frame.frame || null;
  };

  const hasAllPoints = useCallback((pts: Keypoints | null): pts is Required<Keypoints> => {
    return Boolean(pts?.head && pts?.left_hand && pts?.right_hand);
  }, []);

  const resolveNextPointIndex = (pts: Keypoints | null) => {
    if (!pts) return 0;
    if (pts.head && pts.left_hand && pts.right_hand) return POINT_SEQUENCE.length;
    if (pts.head && pts.left_hand) return 2;
    if (pts.head) return 1;
    return 0;
  };

  const clampBoxToImage = useCallback(
    (box: BBox): BBox => {
      if (!imageSize) return box;
      const width = Math.min(box.width, imageSize.width);
      const height = Math.min(box.height, imageSize.height);
      let x = Math.round(box.x);
      let y = Math.round(box.y);
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      if (x + width > imageSize.width) x = imageSize.width - width;
      if (y + height > imageSize.height) y = imageSize.height - height;
      return { x, y, width: Math.round(width), height: Math.round(height) };
    },
    [imageSize]
  );

  const centerOfBox = useCallback((box: BBox): Point => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }), []);

  const buildBoxFromCenter = useCallback(
    (center: Point, size: number): BBox => {
      const half = size / 2;
      const box = {
        x: Math.round(center.x - half),
        y: Math.round(center.y - half),
        width: Math.round(size),
        height: Math.round(size),
      };
      return clampBoxToImage(box);
    },
    [clampBoxToImage]
  );

  const buildBoxesFromKeypoints = useCallback(
    (pts: Keypoints, size: number) => ({
      head: pts.head ? buildBoxFromCenter(pts.head, size) : null,
      left_hand: pts.left_hand ? buildBoxFromCenter(pts.left_hand, size) : null,
      right_hand: pts.right_hand ? buildBoxFromCenter(pts.right_hand, size) : null,
    }),
    [buildBoxFromCenter]
  );

  const fetchData = useCallback(async (): Promise<{ frames: string[]; meta: Record<string, FrameMeta> }> => {
    if (!sessionId) return { frames: [], meta: {} };
    try {
      const [framesRes, labelsRes] = await Promise.all([
        apiClient.get(`/api/videos/${sessionId}/frames`),
        apiClient.get(`/api/labels/${sessionId}`),
      ]);

      const frameNames: string[] = framesRes.data?.frames ?? [];
      const detail: any[] = labelsRes.data?.detail ?? [];

      const meta: Record<string, FrameMeta> = {};
      frameNames.forEach((name) => {
        meta[name] = { labeled: false };
      });
      detail.forEach((item) => {
        const name = normalizeFrameName(item);
        if (!name) return;
        meta[name] = {
          labeled: Boolean(item.labeled),
          label: item.label ?? null,
          hand_label: item.hand_label ?? null,
          head_box: item.head_box ?? null,
          left_hand_box: item.left_hand_box ?? null,
          right_hand_box: item.right_hand_box ?? null,
          keypoints: item.keypoints ?? null,
          relative_pose: item.relative_pose ?? null,
        };
      });

      setFrames(frameNames);
      setFrameMeta(meta);
      return { frames: frameNames, meta };
    } catch (error) {
      console.error(error);
      setStatus("获取帧或标注状态失败");
      return { frames: [], meta: {} };
    }
  }, [sessionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [sessionId]);

  const visibleFrames = useMemo(() => {
    return filterUnlabeled ? frames.filter((name) => !frameMeta[name]?.labeled) : frames;
  }, [frames, frameMeta, filterUnlabeled]);

  useEffect(() => {
    if (currentIndex >= visibleFrames.length) {
      setCurrentIndex(Math.max(visibleFrames.length - 1, 0));
    }
  }, [visibleFrames, currentIndex]);

  const currentFrame = visibleFrames[currentIndex] ?? null;

  useEffect(() => {
    if (!currentFrame) return;
    const meta = frameMeta[currentFrame];
    const inherited = inheritEnabled && lastBoxesRef.current ? lastBoxesRef.current : null;
    const nextHead = meta?.head_box ?? inherited?.head ?? null;
    const nextLeft = meta?.left_hand_box ?? inherited?.left_hand ?? null;
    const nextRight = meta?.right_hand_box ?? inherited?.right_hand ?? null;
    const derivedKeypoints = meta?.keypoints ?? {
      head: nextHead ? centerOfBox(nextHead) : undefined,
      left_hand: nextLeft ? centerOfBox(nextLeft) : undefined,
      right_hand: nextRight ? centerOfBox(nextRight) : undefined,
    };
    const nextKeypoints =
      derivedKeypoints.head || derivedKeypoints.left_hand || derivedKeypoints.right_hand
        ? derivedKeypoints
        : null;

    setSelectedLabel(meta?.label ?? null);
    setSelectedHandLabel(meta?.hand_label ?? null);
    setHeadBox(nextHead);
    setLeftHandBox(nextLeft);
    setRightHandBox(nextRight);
    setKeypoints(nextKeypoints);
    setNextPointIndex(resolveNextPointIndex(nextKeypoints));
    setPointMode(!hasAllPoints(nextKeypoints));
  }, [centerOfBox, currentFrame, frameMeta, hasAllPoints, inheritEnabled]);

  useEffect(() => {
    if (!headBox) return;
    const nextSize = Math.round(headBox.width);
    setBoxSizeInput(String(nextSize));
    setBoxSize(nextSize);
    setBoxSizeInvalid(false);
  }, [headBox]);

  const imageUrl = useMemo(() => {
    if (!sessionId || !currentFrame) {
      return null;
    }
    return `${apiClient.defaults.baseURL}/api/videos/${sessionId}/frames/${currentFrame}`;
  }, [sessionId, currentFrame]);

  const labelCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    Object.values(frameMeta).forEach((meta) => {
      if (meta?.labeled && meta.label && counts[meta.label] !== undefined) {
        counts[meta.label] += 1;
      }
    });
    return counts;
  }, [frameMeta]);

  const handLabelCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    Object.values(frameMeta).forEach((meta) => {
      if (meta?.labeled && meta.hand_label && counts[meta.hand_label] !== undefined) {
        counts[meta.hand_label] += 1;
      }
    });
    return counts;
  }, [frameMeta]);

  const pointOverlays = useMemo(() => {
    if (!keypoints) return [];
    const overlays: { x: number; y: number; label: string }[] = [];
    if (keypoints.head) overlays.push({ ...keypoints.head, label: "H" });
    if (keypoints.left_hand) overlays.push({ ...keypoints.left_hand, label: "L" });
    if (keypoints.right_hand) overlays.push({ ...keypoints.right_hand, label: "R" });
    return overlays;
  }, [keypoints]);

  const nextPointLabel = useMemo(() => {
    if (hasAllPoints(keypoints)) return "完成";
    const idx = Math.min(nextPointIndex, POINT_SEQUENCE.length - 1);
    return POINT_LABELS[POINT_SEQUENCE[idx]];
  }, [keypoints, nextPointIndex]);

  const clearPointAnnotation = useCallback(() => {
    setKeypoints(null);
    setHeadBox(null);
    setLeftHandBox(null);
    setRightHandBox(null);
    setNextPointIndex(0);
    setPointMode(true);
    setHeadPreviewUrl(null);
    setLeftHandPreviewUrl(null);
    setRightHandPreviewUrl(null);
  }, []);

  const handlePointClick = useCallback(
    (pt: Point) => {
      if (!pointMode) return;
      if (!boxSize || boxSizeInvalid) {
        setStatus("请先设置选定框边长");
        return;
      }

      const step = Math.min(nextPointIndex, POINT_SEQUENCE.length - 1);
      const pointKey = POINT_SEQUENCE[step];
      const updated: Keypoints = { ...(keypoints || {}), [pointKey]: pt };
      const nextIdx = step + 1;

      setKeypoints(updated);
      setNextPointIndex(nextIdx);

      const nextBoxes = buildBoxesFromKeypoints(updated, boxSize);
      setHeadBox(nextBoxes.head);
      setLeftHandBox(nextBoxes.left_hand);
      setRightHandBox(nextBoxes.right_hand);

      if (nextIdx >= POINT_SEQUENCE.length) {
        setPointMode(false);
        setStatus("标注点已完成");
      } else {
        const nextLabel = POINT_LABELS[POINT_SEQUENCE[nextIdx]];
        setStatus(`已记录${POINT_LABELS[pointKey]}，请点击${nextLabel}`);
      }
    },
    [boxSize, boxSizeInvalid, buildBoxesFromKeypoints, keypoints, nextPointIndex, pointMode]
  );

  useEffect(() => {
    if (!boxSize || !keypoints) return;
    const nextBoxes = buildBoxesFromKeypoints(keypoints, boxSize);
    setHeadBox(nextBoxes.head);
    setLeftHandBox(nextBoxes.left_hand);
    setRightHandBox(nextBoxes.right_hand);
  }, [boxSize, buildBoxesFromKeypoints, keypoints]);

  const boxes = useMemo(() => {
    const items = [headBox, leftHandBox, rightHandBox].filter(Boolean);
    return items as BBox[];
  }, [headBox, leftHandBox, rightHandBox]);

  useEffect(() => {
    if (!imageUrl) {
      setHeadPreviewUrl(null);
      setLeftHandPreviewUrl(null);
      setRightHandPreviewUrl(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const renderPreview = (box: BBox | null) => {
        if (!box) return null;
        const canvas = document.createElement("canvas");
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, size, size);
        return canvas.toDataURL("image/jpeg");
      };

      setHeadPreviewUrl(renderPreview(headBox));
      setLeftHandPreviewUrl(renderPreview(leftHandBox));
      setRightHandPreviewUrl(renderPreview(rightHandBox));
    };
    img.src = imageUrl;
  }, [headBox, leftHandBox, rightHandBox, imageUrl]);

  const submitLabel = useCallback(async () => {
    if (
      !sessionId ||
      !currentFrame ||
      !headBox ||
      !leftHandBox ||
      !rightHandBox ||
      selectedLabel === null ||
      selectedHandLabel === null
    ) {
      setStatus("请先完成框选/选择标签后再保存");
      return;
    }

    const payload = {
      boxes: {
        head: headBox,
        left_hand: leftHandBox,
        right_hand: rightHandBox,
      },
      label: selectedLabel,
      hand_label: selectedHandLabel,
    };

    try {
      await apiClient.post(`/api/labels/${sessionId}/frame/${currentFrame}`, payload);
      setStatus(`已保存 ${currentFrame}`);
      const { frames: refreshedFrames, meta } = await fetchData();
      const nextVisible = filterUnlabeled
        ? refreshedFrames.filter((name) => !meta[name]?.labeled)
        : refreshedFrames;
      const nextIndex =
        nextVisible.length === 0
          ? 0
          : Math.min(filterUnlabeled ? currentIndex : currentIndex + 1, nextVisible.length - 1);
      lastBoxesRef.current = { head: headBox, left_hand: leftHandBox, right_hand: rightHandBox };
      setCurrentIndex(nextIndex);
    } catch (error) {
      console.error(error);
      setStatus("保存失败，请检查后端接口");
    }
  }, [
    currentFrame,
    currentIndex,
    fetchData,
    filterUnlabeled,
    headBox,
    leftHandBox,
    rightHandBox,
    selectedHandLabel,
    selectedLabel,
    sessionId,
  ]);

  const exportDataset = async () => {
    if (!sessionId) {
      setStatus("缺少 sessionId，无法导出");
      return;
    }
    try {
      const { data } = await apiClient.post(`/api/export/${sessionId}`);
      const downloadUrl = data.download_url;
      if (downloadUrl) {
        const fullUrl = `${apiClient.defaults.baseURL}${downloadUrl}`;
        setStatus("正在导出数据集...");
        window.open(fullUrl, "_blank");
      } else {
        setStatus("导出完成，但未返回下载链接");
      }
    } catch (error) {
      console.error(error);
      setStatus("导出失败，请稍后重试");
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName || "")) return;

      if (e.key >= "1" && e.key <= "5") {
        if (e.shiftKey) {
          setSelectedHandLabel(Number(e.key));
        } else {
          setSelectedLabel(Number(e.key));
        }
        return;
      }

      if (e.key === "ArrowLeft" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowRight" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(visibleFrames.length - 1, i + 1));
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        submitLabel();
        return;
      }
      if (e.key.toLowerCase() === "r") {
        clearPointAnnotation();
        return;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [clearPointAnnotation, submitLabel, visibleFrames.length]);

  return (
    <div style={styles.pageContainer} ref={containerRef} tabIndex={-1}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <h2 style={styles.headerTitle}>姿态标注</h2>
          <span style={{ fontSize: "0.8rem", color: "#999", paddingTop: "4px" }}>{sessionId}</span>
        </div>

        <div style={styles.headerActions}>
          <div style={{ fontSize: "0.85rem", color: "#666", marginRight: "12px" }}>
            进度: {frames.filter((name) => frameMeta[name]?.labeled).length} / {frames.length}
          </div>
          <button
            type="button"
            style={{ ...styles.button, ...styles.ghostButton }}
            onClick={() => setFilterUnlabeled((prev) => !prev)}
          >
            {filterUnlabeled ? "显示全部" : "只看未标注"}
          </button>
          <button
            type="button"
            style={styles.button}
            onClick={async () => {
              if (!sessionId) return;
              try {
                await apiClient.post(`/api/labels/${sessionId}/reset`);
                const { frames: refreshedFrames, meta } = await fetchData();
                setCurrentIndex(0);
                setSelectedLabel(null);
                setSelectedHandLabel(null);
                clearPointAnnotation();
                setStatus("标注已清空，重新开始");
                if (filterUnlabeled) {
                  const nextVisible = refreshedFrames.filter((name) => !meta[name]?.labeled);
                  if (nextVisible.length === 0) {
                    setCurrentIndex(0);
                  }
                }
              } catch (error) {
                console.error(error);
                setStatus("清空标注失败");
              }
            }}
          >
            刷新
          </button>
          <button type="button" style={{ ...styles.button, borderColor: "#111", color: "#111" }} onClick={exportDataset}>
            导出数据
          </button>
        </div>
      </header>

      <div style={styles.mainWorkspace}>
        <div style={styles.canvasArea}>
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ImageCropper
              imageUrl={imageUrl}
              boxes={boxes}
              pointMode={pointMode}
              onPointClick={handlePointClick}
              points={pointOverlays}
              onImageLoad={setImageSize}
            />
          </div>

          <div
            style={{
              position: "absolute",
              top: 20,
              left: 20,
              background: "rgba(255,255,255,0.9)",
              padding: "4px 12px",
              borderRadius: "20px",
              fontSize: "0.75rem",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
            }}
          >
            当前帧: {currentFrame ?? "-"}
          </div>
        </div>

        <aside style={styles.sidebar}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={styles.sectionTitle}>帧继承</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#555" }}>
                <input
                  type="checkbox"
                  checked={inheritEnabled}
                  onChange={(e) => setInheritEnabled(e.target.checked)}
                />
                下一帧沿用上一帧框
              </label>
            </div>
            <div style={styles.sectionTitle}>选定框边长</div>
            <input
              type="number"
              min={MIN_BOX_SIZE}
              value={boxSizeInput}
              onChange={(e) => {
                const raw = e.target.value;
                setBoxSizeInput(raw);
                const parsed = parseInt(raw, 10);
                if (Number.isNaN(parsed) || parsed < MIN_BOX_SIZE) {
                  setBoxSizeInvalid(true);
                  setBoxSize(null);
                } else {
                  setBoxSizeInvalid(false);
                  setBoxSize(parsed);
                }
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: boxSizeInvalid ? "1px solid #d72638" : "1px solid #e5e5e5",
              }}
            />
            {boxSizeInvalid && (
              <div style={{ color: "#d72638", fontSize: "0.8rem", marginTop: "6px" }}>边长需 ≥ 16</div>
            )}
          </div>

          <div>
            <div style={styles.sectionTitle}>标注点</div>
            <div style={{ fontSize: "0.85rem", color: "#555" }}>
              {hasAllPoints(keypoints) ? "标注完成" : `下一点:${nextPointLabel}`}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <button type="button" style={{ ...styles.button, ...styles.primaryButton, flex: 1 }} onClick={clearPointAnnotation}>
                重新标点
              </button>
              <button type="button" style={{ ...styles.button, flex: 1 }} onClick={clearPointAnnotation}>
                清空点
              </button>
            </div>
            <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "8px" }}>
              按顺序点击：头部、左手、右手
            </div>
          </div>

          <div>
            <div style={styles.sectionTitle}>预览</div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ border: "1px solid #f0f0f0", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: "6px" }}>头部</div>
                {headPreviewUrl ? (
                  <img
                    src={headPreviewUrl}
                    alt="头部预览"
                    style={{ width: "100%", borderRadius: "8px", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}
                  />
                ) : (
                  <div style={{ color: "#aaa", fontSize: "0.85rem" }}>暂无选定框</div>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <div
                  style={{
                    flex: 1,
                    border: "1px solid #f0f0f0",
                    borderRadius: "8px",
                    padding: "10px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: "6px" }}>左手</div>
                  {leftHandPreviewUrl ? (
                    <img
                      src={leftHandPreviewUrl}
                      alt="左手预览"
                      style={{ width: "100%", borderRadius: "6px", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}
                    />
                  ) : (
                    <div style={{ color: "#aaa", fontSize: "0.75rem" }}>暂无选定框</div>
                  )}
                </div>
                <div
                  style={{
                    flex: 1,
                    border: "1px solid #f0f0f0",
                    borderRadius: "8px",
                    padding: "10px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: "6px" }}>右手</div>
                  {rightHandPreviewUrl ? (
                    <img
                      src={rightHandPreviewUrl}
                      alt="右手预览"
                      style={{ width: "100%", borderRadius: "6px", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}
                    />
                  ) : (
                    <div style={{ color: "#aaa", fontSize: "0.75rem" }}>暂无选定框</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #f0f0f0" }} />

          <div>
            <div style={styles.sectionTitle}>头部姿态</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <div className="tag">正：{labelCounts[1] ?? 0}</div>
              <div className="tag">下：{labelCounts[2] ?? 0}</div>
              <div className="tag">左：{labelCounts[3] ?? 0}</div>
              <div className="tag">右：{labelCounts[4] ?? 0}</div>
              <div className="tag">歪：{labelCounts[5] ?? 0}</div>
            </div>
            <div style={styles.labelGrid}>
              {[
                { value: 1, text: "正" },
                { value: 2, text: "下" },
                { value: 3, text: "左" },
                { value: 4, text: "右" },
                { value: 5, text: "歪" },
              ].map(({ value, text }) => (
                <button
                  key={text}
                  type="button"
                  style={selectedLabel === value ? { ...styles.labelBtn, ...styles.activeLabelBtn } : styles.labelBtn}
                  onClick={() => setSelectedLabel(value)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={styles.sectionTitle}>手部姿态</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <div className="tag">空手：{handLabelCounts[1] ?? 0}</div>
              <div className="tag">手拿手机：{handLabelCounts[2] ?? 0}</div>
              <div className="tag">手拿书：{handLabelCounts[3] ?? 0}</div>
              <div className="tag">手拿笔：{handLabelCounts[4] ?? 0}</div>
              <div className="tag">其他：{handLabelCounts[5] ?? 0}</div>
            </div>
            <div style={styles.labelGrid}>
              {[
                { value: 1, text: "空手" },
                { value: 2, text: "手拿手机" },
                { value: 3, text: "手拿书" },
                { value: 4, text: "手拿笔" },
                { value: 5, text: "其他" },
              ].map(({ value, text }) => (
                <button
                  key={text}
                  type="button"
                  style={selectedHandLabel === value ? { ...styles.labelBtn, ...styles.activeLabelBtn } : styles.labelBtn}
                  onClick={() => setSelectedHandLabel(value)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "auto" }}>
            {headBox && (
              <div style={{ marginBottom: "12px", fontSize: "0.75rem", color: "#999", fontFamily: "monospace" }}>
                Head X:{Math.round(headBox.x)} Y:{Math.round(headBox.y)} W:{Math.round(headBox.width)} H:{Math.round(headBox.height)}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <button
                type="button"
                style={{
                  ...styles.button,
                  flex: 1,
                  backgroundColor: headBox ? "#d72638" : "#fff",
                  color: headBox ? "#fff" : "#888",
                  borderColor: headBox ? "#d72638" : "#e0e0e0",
                }}
                onClick={clearPointAnnotation}
              >
                重选
              </button>
              <button type="button" style={{ ...styles.button, ...styles.primaryButton, flex: 1, padding: "14px" }} onClick={submitLabel}>
                保存并下一张
              </button>
            </div>
            {status && <div style={styles.statusText}>{status}</div>}
          </div>
        </aside>
      </div>

      <div style={styles.filmstripContainer}>
        {visibleFrames.map((name, idx) => {
          const labeled = frameMeta[name]?.labeled;
          const isActive = idx === currentIndex;
          const url = `${apiClient.defaults.baseURL}/api/videos/${sessionId}/frames/${name}`;

          return (
            <div key={name} onClick={() => setCurrentIndex(idx)} style={{ position: "relative", display: "inline-block" }}>
              <img src={url} alt={name} style={isActive ? { ...styles.thumb, ...styles.thumbActive } : styles.thumb} />
              {labeled && (
                <div
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#0f6fff",
                    border: "1px solid #fff",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default LabelPage;
