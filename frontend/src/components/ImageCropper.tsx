import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

export type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

type AnnotationPoint = Point & { label?: string };

type Props = {
  imageUrl: string | null;
  boxes?: BBox[];
  pointMode?: boolean;
  onPointClick?: (point: Point) => void;
  points?: AnnotationPoint[];
  onImageLoad?: (size: { width: number; height: number }) => void;
};

type LoadedImage = {
  element: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
};

const MAX_DISPLAY_WIDTH = 720;
const POINT_COLORS = ["#d72638", "#1e90ff", "#20a05c"];
const BOX_COLORS = ["#d72638", "#1e90ff", "#20a05c"];

function ImageCropper({ imageUrl, boxes, pointMode = false, onPointClick, points, onImageLoad }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);

  const displaySize = useMemo(() => {
    if (!loaded) return { width: 0, height: 0 };
    const displayWidth = Math.min(MAX_DISPLAY_WIDTH, loaded.naturalWidth);
    const scale = loaded.naturalWidth / displayWidth;
    return { width: displayWidth, height: loaded.naturalHeight / scale };
  }, [loaded]);

  // Load image
  useEffect(() => {
    if (!imageUrl) {
      setLoaded(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setLoaded({ element: img, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
      onImageLoad?.({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [imageUrl, onImageLoad]);

  // Draw image + overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(loaded.element, 0, 0, canvas.width, canvas.height);

    if (boxes && boxes.length > 0) {
      const scaleX = loaded.naturalWidth / canvas.width;
      const scaleY = loaded.naturalHeight / canvas.height;
      boxes.forEach((box, idx) => {
        const color = BOX_COLORS[idx % BOX_COLORS.length];
        const x = box.x / scaleX;
        const y = box.y / scaleY;
        const width = box.width / scaleX;
        const height = box.height / scaleY;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.fillStyle = "rgba(30, 144, 255, 0.12)";
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
      });
    }

    if (points && points.length > 0) {
      const scaleX = loaded.naturalWidth / canvas.width;
      const scaleY = loaded.naturalHeight / canvas.height;
      points.forEach((pt, idx) => {
        const px = pt.x / scaleX;
        const py = pt.y / scaleY;
        const color = POINT_COLORS[idx % POINT_COLORS.length];
        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (pt.label) {
          ctx.font = "12px sans-serif";
          ctx.fillStyle = color;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3;
          ctx.strokeText(pt.label, px + 8, py - 8);
          ctx.fillText(pt.label, px + 8, py - 8);
        }
        ctx.restore();
      });
    }
  }, [loaded, displaySize, points, boxes]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const xOnCanvas = (event.clientX - rect.left) * (canvas.width / rect.width);
    const yOnCanvas = (event.clientY - rect.top) * (canvas.height / rect.height);
    const scaleX = loaded.naturalWidth / canvas.width;
    const scaleY = loaded.naturalHeight / canvas.height;
    const naturalPoint = { x: xOnCanvas * scaleX, y: yOnCanvas * scaleY };

    if (pointMode && onPointClick) {
      onPointClick(naturalPoint);
    }
  };

  return (
    <div className="card-padding" style={{ width: "100%" }}>
      {imageUrl ? (
        <canvas
          ref={canvasRef}
          style={{ width: "100%", maxWidth: `${MAX_DISPLAY_WIDTH}px`, touchAction: "none", display: "block" }}
          onPointerDown={handlePointerDown}
        />
      ) : (
        <p className="status">选择一帧后显示图像</p>
      )}
      <div className="status" style={{ marginTop: "8px" }}>
        {boxes && boxes.length > 0
          ? `已选择 ${boxes.length} 个框`
          : "等待框选"}
      </div>
    </div>
  );
}

export default ImageCropper;
