import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import apiClient from "../api/client";

// --- Types (Unchanged) ---
type DetectionBox = {
  x: number;
  y: number;
  box_size: number;
  image_width: number;
  image_height: number;
};

type FrameMeta = {
  detection_boxes?: DetectionBox[];
  detection_saved?: boolean;
};

// --- Styles (Platinum Aesthetic) ---
const styles = {
  container: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    flexDirection: "column" as const,
    backgroundColor: "#ffffff",
    fontFamily: '"Inter", "Helvetica Neue", sans-serif',
    overflow: "hidden",
    color: "#1a1a1a",
  },
  header: {
    height: "60px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    borderBottom: "1px solid #e5e5e5",
    backgroundColor: "#ffffff",
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: '"Playfair Display", serif',
    fontSize: "1.2rem",
    fontWeight: 600,
    color: "#111",
    letterSpacing: "-0.01em",
  },
  headerActions: {
    display: "flex",
    gap: "24px",
    alignItems: "center",
  },
  navLink: {
    fontSize: "0.85rem",
    color: "#666",
    textDecoration: "none",
    cursor: "pointer",
    transition: "color 0.2s",
    background: "none",
    border: "none",
    padding: 0,
  },
  workspace: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  canvasArea: {
    flex: 1,
    backgroundColor: "#f9f9f9", // Subtle contrast for workspace
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "auto",
    position: "relative" as const,
    padding: "20px",
  },
  sidebar: {
    width: "320px",
    backgroundColor: "#ffffff",
    borderLeft: "1px solid #e5e5e5",
    display: "flex",
    flexDirection: "column" as const,
    padding: "0",
    overflowY: "auto" as const,
    boxShadow: "-5px 0 20px rgba(0,0,0,0.02)",
  },
  sidebarSection: {
    padding: "24px",
    borderBottom: "1px solid #f0f0f0",
  },
  sectionTitle: {
    fontSize: "0.7rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: "#999",
    marginBottom: "12px",
    fontWeight: 600,
  },
  controlRow: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "0", // Geometric
    border: "1px solid #e0e0e0",
    fontSize: "0.9rem",
    outline: "none",
    transition: "border-color 0.2s",
    backgroundColor: "#fcfcfc",
  },
  button: {
    padding: "10px 16px",
    border: "1px solid #e0e0e0",
    borderRadius: "2px",
    fontSize: "0.85rem",
    cursor: "pointer",
    backgroundColor: "transparent",
    color: "#333",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
    padding: "8px",
  },
  boxItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    border: "1px solid #f0f0f0",
    marginBottom: "8px",
    fontSize: "0.8rem",
    color: "#555",
    backgroundColor: "#fff",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  statusTag: {
    fontSize: "0.75rem",
    color: "#888",
    textAlign: "center" as const,
    marginTop: "12px",
    fontFamily: "monospace",
  },
};

function DetectionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [frames, setFrames] = useState<string[]>([]);
  const [frameMeta, setFrameMeta] = useState<Record<string, FrameMeta>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [boxSizeInput, setBoxSizeInput] = useState("64");
  const [boxSize, setBoxSize] = useState<number | null>(64);
  const [boxSizeInvalid, setBoxSizeInvalid] = useState(false);
  const [status, setStatus] = useState("");
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number; element: HTMLImageElement } | null>(
    null
  );
  const [previewBoxes, setPreviewBoxes] = useState<DetectionBox[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- Logic (Unchanged) ---

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const [framesRes, labelsRes] = await Promise.all([
        apiClient.get(`/api/videos/${sessionId}/frames`),
        apiClient.get(`/api/labels/${sessionId}`),
      ]);
      const frameNames: string[] = framesRes.data?.frames ?? [];
      const detail: any[] = labelsRes.data?.detail ?? [];
      const meta: Record<string, FrameMeta> = {};
      frameNames.forEach((name) => (meta[name] = {}));
      detail.forEach((item) => {
        const name = item.frame_name || item.frame;
        if (name) {
          meta[name] = { detection_boxes: item.detection_boxes ?? [], detection_saved: item.detection_saved };
        }
      });
      setFrames(frameNames);
      setFrameMeta(meta);
    } catch (error) {
      console.error(error);
      setStatus("加载帧或标注失败");
    }
  }, [sessionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentFrame = useMemo(() => frames[currentIndex] ?? null, [frames, currentIndex]);

  useEffect(() => {
    if (!currentFrame) return;
    const boxes = frameMeta[currentFrame]?.detection_boxes ?? [];
    setPreviewBoxes(boxes);
  }, [currentFrame, frameMeta]);

  const imageUrl = useMemo(() => {
    if (!sessionId || !currentFrame) return null;
    return `${apiClient.defaults.baseURL}/api/videos/${sessionId}/frames/${currentFrame}`;
  }, [sessionId, currentFrame]);

  // Load image for natural size
  useEffect(() => {
    if (!imageUrl) {
      setImageInfo(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImageInfo({ width: img.naturalWidth, height: img.naturalHeight, element: img });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Draw image and boxes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageInfo) return;
    
    // VISUAL FIX: Increased maxWidth significantly to allow "Hero" sizing in the new layout
    const maxWidth = 1600; 
    
    const displayWidth = Math.min(maxWidth, imageInfo.width);
    const scaleX = imageInfo.width / displayWidth;
    const displayHeight = imageInfo.height / scaleX;
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageInfo.element, 0, 0, canvas.width, canvas.height);

    previewBoxes.forEach((box) => {
      const half = box.box_size / 2;
      const x1 = (box.x - half) / scaleX;
      const y1 = (box.y - half) / scaleX;
      const size = box.box_size / scaleX;
      ctx.save();
      ctx.strokeStyle = "#1e90ff";
      ctx.lineWidth = 2;
      ctx.fillStyle = "rgba(30, 144, 255, 0.15)";
      ctx.fillRect(x1, y1, size, size);
      ctx.strokeRect(x1, y1, size, size);
      ctx.restore();
    });
  }, [imageInfo, previewBoxes]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !imageInfo || !boxSize || boxSizeInvalid) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const xCanvas = (event.clientX - rect.left) * (canvas.width / rect.width);
    const yCanvas = (event.clientY - rect.top) * (canvas.height / rect.height);
    const scaleX = imageInfo.width / canvas.width;
    const scaleY = imageInfo.height / canvas.height;
    const cx = xCanvas * scaleX;
    const cy = yCanvas * scaleY;
    const half = boxSize / 2;
    const clampedX = Math.min(Math.max(cx, half), imageInfo.width - half);
    const clampedY = Math.min(Math.max(cy, half), imageInfo.height - half);
    const newBox: DetectionBox = {
      x: clampedX,
      y: clampedY,
      box_size: boxSize,
      image_width: imageInfo.width,
      image_height: imageInfo.height,
    };
    setPreviewBoxes((prev) => [...prev, newBox]);
  };

  const removeBox = (index: number) => {
    setPreviewBoxes((prev) => prev.filter((_, i) => i !== index));
  };

  const persistDetections = async (savedFlag: boolean) => {
    if (!sessionId || !currentFrame) return false;

    const sanitizedBoxes = previewBoxes
      .map((box) => ({
        x: Number(box.x),
        y: Number(box.y),
        box_size: Number(box.box_size),
        image_width: Number(box.image_width),
        image_height: Number(box.image_height),
      }))
      .filter((box) => {
        const values = [box.x, box.y, box.box_size, box.image_width, box.image_height];
        return values.every((v) => Number.isFinite(v)) && box.box_size > 0 && box.image_width > 0 && box.image_height > 0;
      });

    if (sanitizedBoxes.length !== previewBoxes.length) {
      setPreviewBoxes(sanitizedBoxes);
    }

    if (savedFlag && sanitizedBoxes.length === 0) {
      setStatus("请先添加有效检测框再保存");
      return false;
    }

    try {
      const { data } = await apiClient.post(`/api/labels/${sessionId}/frame/${currentFrame}/detections`, {
        detections: sanitizedBoxes,
        saved: savedFlag,
      });
      const savedResult = Boolean(data?.saved);
      if (savedFlag && !savedResult) {
        setStatus(data?.message || "保存失败：无有效选框");
        return false;
      }
      const extraMessage = data?.message ? ` | ${data.message}` : "";
      setStatus(savedFlag ? `已保存并计入导出: ${currentFrame}${extraMessage}` : `暂存: ${currentFrame}${extraMessage}`);
      setFrameMeta((prev) => ({
        ...prev,
        [currentFrame]: {
          ...(prev[currentFrame] || {}),
          detection_boxes: sanitizedBoxes,
          detection_saved: savedResult,
        },
      }));
      return true;
    } catch (error) {
      console.error(error);
      setStatus("保存失败");
      return false;
    }
  };

  const saveAndNext = async () => {
    const ok = await persistDetections(true);
    if (ok) {
      setCurrentIndex((idx) => Math.min(idx + 1, frames.length - 1));
    }
  };

  const resetFrame = () => {
    setPreviewBoxes([]);
    setStatus("当前帧已清空");
  };

  const exportDetections = async () => {
    if (!sessionId) return;
    try {
      const { data } = await apiClient.post(`/api/export/detections/${sessionId}`);
      const downloadUrl = data.download_url;
      if (downloadUrl) {
        const fullUrl = `${apiClient.defaults.baseURL}${downloadUrl}`;
        window.open(fullUrl, "_blank");
      }
    } catch (error) {
      console.error(error);
      setStatus("导出失败");
    }
  };

  // --- Render ---

  return (
    <div style={styles.container}>
      {/* 1. Slim Header */}
      <header style={styles.header}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h2 style={styles.headerTitle}>Detection Studio</h2>
          <span style={{ fontSize: "0.7rem", color: "#bbb", letterSpacing: "0.05em" }}>SESSION ID: {sessionId}</span>
        </div>
        <div style={styles.headerActions}>
          <button type="button" style={styles.navLink} onClick={() => navigate(`/loading/${sessionId}`)}>
            返回进度
          </button>
          <span style={{ color: "#e5e5e5" }}>|</span>
          <button type="button" style={styles.navLink} onClick={() => navigate(`/label/${sessionId}`)}>
            切换至姿态标注
          </button>
        </div>
      </header>

      {/* 2. Main Workspace */}
      <div style={styles.workspace}>
        {/* Left: Canvas / Image Area */}
        <div style={styles.canvasArea}>
          {imageUrl ? (
            <canvas
              ref={canvasRef}
              style={{ 
                boxShadow: "0 20px 50px rgba(0,0,0,0.05)", 
                borderRadius: "4px",
                maxWidth: "100%", // Responsive
                maxHeight: "100%", // Responsive
                display: "block"
              }}
              onClick={handleCanvasClick}
            />
          ) : (
            <p style={{ color: "#aaa", fontSize: "0.9rem" }}>Loading frame data...</p>
          )}
          
          {/* Floating Frame Tag */}
          <div style={{ 
            position: 'absolute', bottom: 20, left: 20, 
            background: 'rgba(255,255,255,0.85)', padding: '6px 12px', 
            borderRadius: '4px', fontSize: '0.75rem', color: '#555',
            backdropFilter: 'blur(4px)', border: '1px solid rgba(0,0,0,0.05)'
          }}>
            Frame: {currentFrame ?? "-"}
          </div>
        </div>

        {/* Right: Sidebar Controls */}
        <aside style={styles.sidebar}>
          
          {/* Navigation */}
          <div style={styles.sidebarSection}>
            <div style={styles.sectionTitle}>Navigation</div>
            <div style={styles.controlRow}>
              <button 
                type="button" 
                style={{ ...styles.button, flex: 1 }} 
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              >
                ← Prev
              </button>
              <button
                type="button"
                style={{ ...styles.button, flex: 1 }}
                onClick={() => setCurrentIndex((i) => Math.min(frames.length - 1, i + 1))}
              >
                Next →
              </button>
            </div>
            <div style={{ textAlign: "center", marginTop: "12px", fontSize: "0.8rem", color: "#888" }}>
              {currentIndex + 1} / {frames.length}
            </div>
          </div>

          {/* Settings */}
          <div style={styles.sidebarSection}>
            <div style={styles.sectionTitle}>Settings</div>
            <label style={{ fontSize: "0.8rem", color: "#555", display: "block", marginBottom: "8px" }}>
              Detection Box Size (px)
            </label>
            <input
              type="number"
              min={1}
              value={boxSizeInput}
              onChange={(e) => {
                const raw = e.target.value;
                setBoxSizeInput(raw);
                const parsed = parseInt(raw, 10);
                if (Number.isNaN(parsed) || parsed <= 0) {
                  setBoxSizeInvalid(true);
                  setBoxSize(null);
                } else {
                  setBoxSizeInvalid(false);
                  setBoxSize(parsed);
                }
              }}
              style={{
                ...styles.input,
                borderColor: boxSizeInvalid ? "#d72638" : "#e0e0e0",
              }}
            />
            {boxSizeInvalid && <div style={{ color: "#d72638", fontSize: "0.75rem", marginTop: "6px" }}>Invalid Size</div>}
          </div>

          {/* Active Boxes List */}
          <div style={{ ...styles.sidebarSection, flex: 1, overflowY: "auto", minHeight: "200px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={styles.sectionTitle}>Active Detections</div>
              <button 
                type="button" 
                style={{ ...styles.button, ...styles.ghostButton, fontSize: "0.7rem", color: "#d72638" }}
                onClick={resetFrame}
              >
                Clear All
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {previewBoxes.length === 0 && (
                <div style={{ fontSize: "0.8rem", color: "#ccc", padding: "12px 0", textAlign: "center" }}>
                  No detections on this frame.
                </div>
              )}
              {previewBoxes.map((box, idx) => (
                <button
                  key={`${box.x}-${box.y}-${idx}`}
                  type="button"
                  style={styles.boxItem}
                  onClick={() => removeBox(idx)}
                >
                  <span>#{idx + 1}</span>
                  <span style={{ fontFamily: "monospace", color: "#999" }}>
                    {Math.round(box.x)}, {Math.round(box.y)}
                  </span>
                  <span style={{ color: "#d72638", fontWeight: "bold" }}>×</span>
                </button>
              ))}
            </div>
          </div>

          {/* Primary Actions */}
          <div style={{ padding: "24px", backgroundColor: "#fcfcfc", borderTop: "1px solid #e5e5e5" }}>
            <button 
              type="button" 
              style={{ ...styles.button, ...styles.primaryButton, width: "100%", padding: "14px", marginBottom: "12px" }}
              onClick={saveAndNext}
            >
              Save & Next Frame
            </button>
            
            <div style={{ display: "flex", gap: "10px" }}>
              <button 
                type="button" 
                style={{ ...styles.button, flex: 1, fontSize: "0.75rem" }}
                onClick={() => persistDetections(false)}
              >
                Save Draft
              </button>
              <button 
                type="button" 
                style={{ ...styles.button, flex: 1, fontSize: "0.75rem" }}
                onClick={exportDetections}
              >
                Export Data
              </button>
            </div>
            
            {status && <div style={styles.statusTag}>{status}</div>}
          </div>

        </aside>
      </div>
    </div>
  );
}

export default DetectionPage;
