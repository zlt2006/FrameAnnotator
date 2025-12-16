from pathlib import Path
from typing import Tuple

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
VIDEOS_DIR = DATA_DIR / "videos"
FRAMES_DIR = DATA_DIR / "frames"
CROPS_DIR = DATA_DIR / "crops"
LABELS_DIR = DATA_DIR / "labels"

FRAME_PREFIX = "frame_"
CROP_PREFIX = "head_"
EXPORT_SUFFIX = "_export.zip"
DET_EXPORT_SUFFIX = "_det_export.zip"
DEFAULT_FRAME_SIZE: Tuple[int, int] = (640, 360)
DEFAULT_CROP_SIZE: Tuple[int, int] = (128, 128)


def ensure_data_dirs() -> None:
    for path in (VIDEOS_DIR, FRAMES_DIR, CROPS_DIR, LABELS_DIR):
        path.mkdir(parents=True, exist_ok=True)
