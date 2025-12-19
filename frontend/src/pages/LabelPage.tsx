import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import apiClient from "../api/client";
import ImageCropper, { BBox } from "../components/ImageCropper";

type FrameMeta = {
  labeled?: boolean;
  label?: number;
  hand_label?: number;
  bbox?: BBox;
  crop_name?: string;
};

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
    fontFamily: '"Playfair Display", serif', // Assuming serif font is available
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
    overflow: "hidden", // Prevents body scroll
  },
  canvasArea: {
    flex: 1,
    backgroundColor: "#f9f9f9", // Soft grey for contrast
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
  // UI Elements
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
  }
};


function LabelPage() {
  const { sessionId } = useParams();
  const [frames, setFrames] = useState<string[]>([]);
  const [frameMeta, setFrameMeta] = useState<Record<string, FrameMeta>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedLabel, setSelectedLabel] = useState<number | null>(null);
  const [selectedHandLabel, setSelectedHandLabel] = useState<number | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropSizeInput, setCropSizeInput] = useState<string>("128");
  const [cropSize, setCropSize] = useState<number | null>(128);
  const [cropSizeInvalid, setCropSizeInvalid] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [filterUnlabeled, setFilterUnlabeled] = useState<boolean>(false);
  const [inheritEnabled, setInheritEnabled] = useState<boolean>(false);
  const lastBboxRef = useRef<BBox | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const normalizeFrameName = (frame: any): string | null => {
    if (!frame) return null;
    return frame.frame_name || frame.frame || null;
  };

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
          bbox: item.bbox ?? null,
          crop_name: item.crop_name ?? null,
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
    const inheritedBBox = inheritEnabled && lastBboxRef.current ? lastBboxRef.current : null;
    const nextBBox = meta?.bbox ?? inheritedBBox;
    setSelectedLabel(meta?.label ?? null);
    setSelectedHandLabel(meta?.hand_label ?? null);
    setBbox(nextBBox);
  }, [currentFrame, frameMeta, inheritEnabled]);

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

  useEffect(() => {
    if (!bbox || !imageUrl) {
      setPreviewUrl(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, size, size);
      setPreviewUrl(canvas.toDataURL("image/jpeg"));
    };
    img.src = imageUrl;
  }, [bbox, imageUrl]);

  const submitLabel = useCallback(async () => {
    if (!sessionId || !currentFrame || bbox === null || selectedLabel === null || selectedHandLabel === null) {
      setStatus("请先选择头部/手部标签并设置裁剪框");
      return;
    }

    try {
      await apiClient.post(`/api/labels/${sessionId}/frame/${currentFrame}`, {
        bbox,
        label: selectedLabel,
        hand_label: selectedHandLabel,
      });
      setStatus(`已保存 ${currentFrame}`);
      const { frames: refreshedFrames, meta } = await fetchData();
      const nextVisible = filterUnlabeled
        ? refreshedFrames.filter((name) => !meta[name]?.labeled)
        : refreshedFrames;
      const nextIndex =
        nextVisible.length === 0
          ? 0
          : Math.min(filterUnlabeled ? currentIndex : currentIndex + 1, nextVisible.length - 1);
      lastBboxRef.current = bbox;
      setCurrentIndex(nextIndex);
    } catch (error) {
      console.error(error);
      setStatus("保存失败，请检查后端接口");
    }
  }, [bbox, currentFrame, currentIndex, fetchData, filterUnlabeled, selectedLabel, selectedHandLabel, sessionId]);

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

  // Keyboard shortcuts: 1-5 头部标签，Shift+1-5 手部标签，左右切帧，空格保存，R 重置框，方向键微调框
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName || "")) return;

      // label shortcuts
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
        setBbox(null);
        setPreviewUrl(null);
        return;
      }

      // micro-move bbox
      if (!bbox) return;
      const step = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setBbox((prev) => (prev ? { ...prev, y: Math.max(0, prev.y - step) } : prev));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setBbox((prev) => (prev ? { ...prev, y: prev.y + step } : prev));
      } else if (e.key === "ArrowLeft" && e.shiftKey) {
        e.preventDefault();
        setBbox((prev) => (prev ? { ...prev, x: Math.max(0, prev.x - step) } : prev));
      } else if (e.key === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        setBbox((prev) => (prev ? { ...prev, x: prev.x + step } : prev));
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [bbox, submitLabel, visibleFrames.length]);

  return (
    <div style={styles.pageContainer} ref={containerRef} tabIndex={-1}>
      
      {/* 1. Header: Slim, clean, global actions only */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={styles.headerTitle}>姿态标注</h2>
          <span style={{ fontSize: '0.8rem', color: '#999', paddingTop: '4px' }}>
            {sessionId}
          </span>
        </div>
        
        <div style={styles.headerActions}>
           <div style={{ fontSize: '0.85rem', color: '#666', marginRight: '12px' }}>
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
                 setBbox(null);
                 setPreviewUrl(null);
                 setStatus("标注已清空，重新开始");
                 // refresh visible frames for unlabeled filter
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
           <button 
             type="button" 
             style={{...styles.button, borderColor: '#111', color: '#111'}}
             onClick={exportDataset}
           >
             导出数据
           </button>
        </div>
      </header>

      {/* 2. Main Workspace: Canvas + Sidebar */}
      <div style={styles.mainWorkspace}>
        
        {/* Left: The Canvas (Flex Grow) */}
        <div style={styles.canvasArea}>
          {/* Constrain the cropper so it doesn't overflow */}
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <ImageCropper
               imageUrl={imageUrl}
               value={bbox}
               onChange={setBbox}
               cropSize={cropSize}
               canSelect={!cropSizeInvalid}
             />
          </div>
          
          {/* Floating Frame Tag */}
          <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(255,255,255,0.9)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
            当前帧: {currentFrame ?? "-"}
          </div>
        </div>

        {/* Right: The Control Panel (Fixed Width) */}
        <aside style={styles.sidebar}>
          
          {/* Crop size */}
          <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={styles.sectionTitle}>帧继承</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#555' }}>
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
              min={1}
              value={cropSizeInput}
              onChange={(e) => {
                const raw = e.target.value;
                setCropSizeInput(raw);
                const parsed = parseInt(raw, 10);
                if (Number.isNaN(parsed) || parsed < 16) {
                  setCropSizeInvalid(true);
                  setCropSize(null);
                } else {
                  setCropSizeInvalid(false);
                  setCropSize(parsed);
                }
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: cropSizeInvalid ? '1px solid #d72638' : '1px solid #e5e5e5'
              }}
            />
            {cropSizeInvalid && (
              <div style={{ color: '#d72638', fontSize: '0.8rem', marginTop: '6px' }}>边长需 ≥ 16</div>
            )}
          </div>

          {/* Preview */}
          <div>
            <div style={styles.sectionTitle}>预览</div>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              {previewUrl ? (
                <img src={previewUrl} alt="预览" style={{ width: '100%', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.06)' }} />
              ) : (
                <div style={{ color: '#aaa', fontSize: '0.85rem' }}>暂无选定框</div>
              )}
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #f0f0f0' }} />

          {/* Label Group */}
          <div>
            <div style={styles.sectionTitle}>分类标签</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '8px', marginBottom: '12px' }}>
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

          {/* Hand label group */}
          <div>
            <div style={styles.sectionTitle}>手部姿态</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '8px', marginBottom: '12px' }}>
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

          {/* Action Group */}
          <div style={{ marginTop: 'auto' }}>
            {bbox && (
              <div style={{ marginBottom: '12px', fontSize: '0.75rem', color: '#999', fontFamily: 'monospace' }}>
                 X:{Math.round(bbox.x)} Y:{Math.round(bbox.y)} W:{Math.round(bbox.width)} H:{Math.round(bbox.height)}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                type="button"
                style={{
                  ...styles.button,
                  flex: 1,
                  backgroundColor: bbox ? '#d72638' : '#fff',
                  color: bbox ? '#fff' : '#888',
                  borderColor: bbox ? '#d72638' : '#e0e0e0',
                }}
                onClick={() => {
                  setBbox(null);
                  setPreviewUrl(null);
                }}
              >
                重选
              </button>
              <button 
                type="button" 
                style={{ ...styles.button, ...styles.primaryButton, flex: 1, padding: '14px' }}
                onClick={submitLabel}
              >
                保存并下一张
              </button>
            </div>
            {status && <div style={styles.statusText}>{status}</div>}
          </div>

        </aside>
      </div>

      {/* 3. Footer: Filmstrip (Thumbnails) */}
      <div style={styles.filmstripContainer}>
        {visibleFrames.map((name, idx) => {
          const labeled = frameMeta[name]?.labeled;
          const isActive = idx === currentIndex;
          const url = `${apiClient.defaults.baseURL}/api/videos/${sessionId}/frames/${name}`;
          
          return (
            <div 
              key={name} 
              onClick={() => setCurrentIndex(idx)}
              style={{ position: 'relative', display: 'inline-block' }}
            >
               <img 
                 src={url} 
                 alt={name} 
                 style={isActive ? { ...styles.thumb, ...styles.thumbActive } : styles.thumb}
               />
               {labeled && (
                 <div style={{
                   position: 'absolute', top: 4, right: 4, width: 8, height: 8, 
                   borderRadius: '50%', backgroundColor: '#0f6fff', border: '1px solid #fff'
                 }} />
               )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

export default LabelPage;
