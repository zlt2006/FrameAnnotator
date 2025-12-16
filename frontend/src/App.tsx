import { Navigate, Route, Routes } from "react-router-dom";

import LabelPage from "./pages/LabelPage";
import DetectionPage from "./pages/DetectionPage";
import LoadingPage from "./pages/LoadingPage";
import UploadPage from "./pages/UploadPage";

function App() {
  return (
    <Routes>
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/loading/:sessionId" element={<LoadingPage />} />
      <Route path="/label/:sessionId" element={<LabelPage />} />
      <Route path="/detect/:sessionId" element={<DetectionPage />} />
      <Route path="*" element={<Navigate to="/upload" replace />} />
    </Routes>
  );
}

export default App;
