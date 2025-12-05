import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import apiClient from "../api/client";

type StatusResponse = {
  status: string;
  total_frames: number;
  processed_frames: number;
  message?: string;
};

function LoadingPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [isError, setIsError] = useState<boolean>(false);

  const progress = useMemo(() => {
    if (!status || status.total_frames === 0) return 0;
    return Math.min(100, Math.round((status.processed_frames / status.total_frames) * 100));
  }, [status]);

  useEffect(() => {
    if (!sessionId) {
      setError("缺少 sessionId");
      return;
    }

    const timer = setInterval(async () => {
      try {
        const { data } = await apiClient.get<StatusResponse>(`/api/videos/${sessionId}/status`);
        setStatus(data);
        if (data.status === "done") {
          clearInterval(timer);
          navigate(`/label/${sessionId}`, { replace: true });
        }
        if (data.status === "error") {
          clearInterval(timer);
          setIsError(true);
        }
      } catch (e) {
        console.error(e);
        setError("获取进度失败");
        setIsError(true);
      }
    }, 1200);

    return () => clearInterval(timer);
  }, [sessionId, navigate]);

  return (
    <div className="page">
      <div className="shell">
        <div className="panel glass card-padding">
          <h1 className="serif">正在抽帧</h1>
          <p className="heading-sub">为您准备标注素材，请稍候</p>
        </div>

        <div className="panel card-padding" style={{ display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="status">Session: {sessionId}</span>
            <span className="status">
              {status ? `${status.processed_frames}/${status.total_frames} 帧` : "初始化中..."}
            </span>
          </div>

          <div
            style={{
              width: "100%",
              height: "14px",
              borderRadius: 999,
              background: "#f0f2f5",
              border: "1px solid rgba(0,0,0,0.06)",
              overflow: "hidden",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "linear-gradient(90deg, #e6ecf7, #0f6fff20, #0f6fff50)",
                transition: "width 0.4s ease",
              }}
            />
          </div>

          <div className="status">
            {status?.status === "queued" && "等待抽帧资源..."}
            {status?.status === "processing" && "抽帧处理中..."}
            {status?.status === "done" && "完成，正在跳转..."}
            {status?.status === "error" && `抽帧失败：${status?.message || ""}`}
            {!status && "请求进度中..."}
            {error && ` | ${error}`}
          </div>

          <div className="button-row" style={{ justifyContent: "flex-end" }}>
            <button className="soft-button" type="button" onClick={() => navigate("/upload")}>
              返回上传
            </button>
            {sessionId && (
              <button
                className="soft-button ghost"
                type="button"
                onClick={async () => {
                  try {
                    await apiClient.delete(`/api/videos/${sessionId}`);
                    navigate("/upload", { replace: true });
                  } catch (e) {
                    console.error(e);
                    setError("清理失败");
                  }
                }}
              >
                清理并返回
              </button>
            )}
            {isError && (
              <button className="soft-button primary" type="button" onClick={() => window.location.reload()}>
                重试
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoadingPage;
