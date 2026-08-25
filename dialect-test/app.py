import sys
import random
import threading
from pathlib import Path

import numpy as np
import sounddevice as sd
import soundfile as sf
import torch
from transformers import pipeline

from PySide6.QtCore import Qt, Signal, QObject
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QProgressBar, QMessageBox, QGroupBox
)

# 공개 평가 정확도 80.63%인 한국어 6개 권역 방언 분류 모델.
MODEL_ID = "HERIUN/wav2vec2-xlsr-korean-dialect-recognition"
MODEL_PUBLIC_ACCURACY = "80.63%"
SAMPLE_RATE = 16000

# 특정 지역 어휘를 일부러 넣지 않고, 억양/발음 차이가 드러날 수 있는
# 일상적인 표준어 문장을 섞어 제시한다.
PROMPTS = [
    "오늘 저녁에는 친구를 만나기로 했어요.",
    "주말에는 가족들과 근처 공원에 다녀왔어요.",
    "아침에 일어나서 커피를 한 잔 마셨어요.",
    "점심을 먹고 잠깐 산책을 하고 왔어요.",
    "퇴근하고 집에 가는 길에 장을 봤어요.",
    "비가 많이 와서 우산을 챙겨서 나왔어요.",
    "내일은 일찍 일어나서 운동을 하려고 해요.",
    "오랜만에 친구에게 전화를 걸어서 이야기했어요.",
    "이번 주에는 해야 할 일이 생각보다 많아요.",
    "저녁을 먹고 나서 재미있는 영화를 봤어요.",
]

REGIONS = ["수도권", "강원", "충청", "경상", "전라", "제주"]


def app_data_dir() -> Path:
    local = Path.home() / "AppData" / "Local" / "DialectTest"
    local.mkdir(parents=True, exist_ok=True)
    return local


APP_DATA = app_data_dir()
RECORDING = APP_DATA / "latest.wav"

LABEL_ALIASES = {
    "서울": "수도권", "경기": "수도권", "수도권": "수도권",
    "강원": "강원", "충청": "충청", "경상": "경상", "전라": "전라", "제주": "제주",
    "seoul": "수도권", "gyeonggi": "수도권", "central": "수도권",
    "gangwon": "강원", "chungcheong": "충청",
    "gyeongsang": "경상", "jeolla": "전라", "jeju": "제주",
}


def normalize_label(label: str):
    raw = str(label).strip()
    low = raw.lower().replace("_", "").replace("-", "").replace("/", "").replace(" ", "")
    for key, value in LABEL_ALIASES.items():
        k = key.lower().replace("_", "").replace("-", "").replace("/", "").replace(" ", "")
        if k in low:
            return value
    return None


class Signals(QObject):
    model_ready = Signal(object)
    result_ready = Signal(object)
    error = Signal(str)


class App(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("내 억양은 어디에 가까울까?")
        self.resize(680, 650)
        self.frames = []
        self.stream = None
        self.recording = False
        self.classifier = None
        self.prompt = random.choice(PROMPTS)

        self.signals = Signals()
        self.signals.model_ready.connect(self.on_model_ready)
        self.signals.result_ready.connect(self.on_result)
        self.signals.error.connect(self.on_error)

        self.build_ui()
        self.load_model()

    def build_ui(self):
        lay = QVBoxLayout(self)
        lay.setSpacing(16)

        title = QLabel("내 억양은 어디에 가까울까?")
        title.setAlignment(Qt.AlignCenter)
        title.setStyleSheet("font-size: 28px; font-weight: 700; margin-top: 8px;")
        lay.addWidget(title)

        self.guide = QLabel("아래 문장을 평소 말하듯 자연스럽게 읽어주세요.")
        self.guide.setAlignment(Qt.AlignCenter)
        self.guide.setStyleSheet("font-size: 15px;")
        lay.addWidget(self.guide)

        box = QGroupBox()
        box_lay = QVBoxLayout(box)
        self.prompt_label = QLabel(self.prompt)
        self.prompt_label.setAlignment(Qt.AlignCenter)
        self.prompt_label.setWordWrap(True)
        self.prompt_label.setStyleSheet("font-size: 23px; font-weight: 600; padding: 24px;")
        box_lay.addWidget(self.prompt_label)
        lay.addWidget(box)

        self.record_btn = QPushButton("녹음 시작")
        self.record_btn.setMinimumHeight(58)
        self.record_btn.setEnabled(False)
        self.record_btn.clicked.connect(self.toggle_record)
        self.record_btn.setStyleSheet("font-size: 18px; font-weight: 700;")
        lay.addWidget(self.record_btn)

        self.analyze_btn = QPushButton("분석하기")
        self.analyze_btn.setMinimumHeight(50)
        self.analyze_btn.setEnabled(False)
        self.analyze_btn.clicked.connect(self.analyze)
        self.analyze_btn.setStyleSheet("font-size: 17px; font-weight: 700;")
        lay.addWidget(self.analyze_btn)

        self.status = QLabel("처음 실행 시 새 판독 모델을 한 번 내려받습니다.")
        self.status.setAlignment(Qt.AlignCenter)
        self.status.setWordWrap(True)
        lay.addWidget(self.status)

        self.result_box = QGroupBox("분석 결과")
        rb = QVBoxLayout(self.result_box)
        self.top_result = QLabel("")
        self.top_result.setAlignment(Qt.AlignCenter)
        self.top_result.setStyleSheet("font-size: 23px; font-weight: 700; padding: 8px;")
        rb.addWidget(self.top_result)

        self.bars = {}
        for region in REGIONS:
            row = QHBoxLayout()
            label = QLabel(region)
            label.setFixedWidth(70)
            bar = QProgressBar()
            bar.setRange(0, 100)
            bar.setValue(0)
            bar.setFormat("%p%")
            row.addWidget(label)
            row.addWidget(bar)
            rb.addLayout(row)
            self.bars[region] = bar

        self.result_box.setVisible(False)
        lay.addWidget(self.result_box)

        self.retry_btn = QPushButton("다시 하기")
        self.retry_btn.setMinimumHeight(52)
        self.retry_btn.setVisible(False)
        self.retry_btn.clicked.connect(self.retry)
        self.retry_btn.setStyleSheet("font-size: 17px; font-weight: 700;")
        lay.addWidget(self.retry_btn)

        foot = QLabel(
            f"사용 모델: HERIUN XLSR 한국어 방언 분류기 (공개 평가 정확도 {MODEL_PUBLIC_ACCURACY}). "
            "표시되는 수치는 실제 출신지역 확률이 아니라 모델의 상대 출력입니다. "
            "공개 평가 조건과 이 앱의 낭독 조건은 다르므로 실제 정확도는 별도로 확인해야 합니다."
        )
        foot.setWordWrap(True)
        foot.setAlignment(Qt.AlignCenter)
        foot.setStyleSheet("font-size: 11px;")
        lay.addWidget(foot)

    def load_model(self):
        def worker():
            try:
                device = 0 if torch.cuda.is_available() else -1
                model = pipeline(
                    "audio-classification",
                    model=MODEL_ID,
                    device=device,
                    trust_remote_code=False,
                )
                self.signals.model_ready.emit(model)
            except Exception as e:
                self.signals.error.emit(
                    "판독 모델을 준비하지 못했습니다.\n"
                    "처음 실행이라면 인터넷 연결을 확인해주세요.\n\n" + str(e)
                )
        threading.Thread(target=worker, daemon=True).start()

    def on_model_ready(self, model):
        self.classifier = model
        self.record_btn.setEnabled(True)
        self.status.setText("준비됐어요. 녹음 시작을 누르고 문장을 읽어주세요.")

    def toggle_record(self):
        if self.recording:
            self.stop_record()
        else:
            self.start_record()

    def start_record(self):
        self.frames = []
        self.recording = True
        self.record_btn.setText("녹음 종료")
        self.analyze_btn.setEnabled(False)
        self.status.setText("녹음 중… 문장을 끝까지 읽은 뒤 녹음 종료를 누르세요.")

        def callback(indata, frames, time_info, status):
            if self.recording:
                self.frames.append(indata.copy())

        try:
            self.stream = sd.InputStream(
                samplerate=SAMPLE_RATE, channels=1, dtype="float32", callback=callback
            )
            self.stream.start()
        except Exception as e:
            self.recording = False
            self.record_btn.setText("녹음 시작")
            QMessageBox.critical(self, "마이크 오류", str(e))

    def stop_record(self):
        if not self.recording:
            return
        self.recording = False
        self.record_btn.setText("녹음 시작")
        try:
            if self.stream:
                self.stream.stop()
                self.stream.close()
                self.stream = None
        except Exception:
            pass

        if not self.frames:
            self.status.setText("녹음된 소리가 없습니다. 다시 녹음해주세요.")
            return

        audio = np.concatenate(self.frames, axis=0).reshape(-1)
        if len(audio) < SAMPLE_RATE:
            self.status.setText("녹음이 너무 짧아요. 문장을 끝까지 읽어주세요.")
            return

        # 앞뒤 침묵이 너무 길면 분류가 흔들릴 수 있어 간단히 제거한다.
        abs_audio = np.abs(audio)
        threshold = max(0.008, float(np.max(abs_audio)) * 0.03)
        active = np.where(abs_audio > threshold)[0]
        if len(active) > 0:
            pad = int(0.15 * SAMPLE_RATE)
            start = max(0, int(active[0]) - pad)
            end = min(len(audio), int(active[-1]) + pad)
            trimmed = audio[start:end]
            if len(trimmed) >= SAMPLE_RATE:
                audio = trimmed

        sf.write(RECORDING, audio, SAMPLE_RATE, subtype="PCM_16")
        self.analyze_btn.setEnabled(True)
        self.status.setText("녹음 완료. 분석하기를 눌러주세요.")

    def analyze(self):
        if self.classifier is None or not RECORDING.exists():
            return

        self.record_btn.setEnabled(False)
        self.analyze_btn.setEnabled(False)
        self.status.setText("분석 중…")

        def worker():
            try:
                audio, sr = sf.read(RECORDING, dtype="float32")
                if audio.ndim > 1:
                    audio = np.mean(audio, axis=1)
                out = self.classifier({"raw": audio, "sampling_rate": sr}, top_k=None)
                self.signals.result_ready.emit(out)
            except Exception as e:
                self.signals.error.emit("분석 중 오류가 발생했습니다.\n\n" + str(e))
        threading.Thread(target=worker, daemon=True).start()

    def on_result(self, outputs):
        scores = {r: 0.0 for r in REGIONS}
        for item in outputs:
            region = normalize_label(item.get("label", ""))
            if region:
                scores[region] += float(item.get("score", 0.0))

        total = sum(scores.values())
        if total <= 0:
            labels = ", ".join(str(x.get("label")) for x in outputs)
            self.on_error("모델 결과의 지역 라벨을 해석하지 못했습니다.\n" + labels)
            return

        probs = {k: v / total for k, v in scores.items()}
        ordered = sorted(probs.items(), key=lambda x: x[1], reverse=True)
        for region, p in probs.items():
            self.bars[region].setValue(round(p * 100))

        best_region, best = ordered[0]
        second_region, second = ordered[1]
        self.top_result.setText(
            f"{best_region} 억양과 가장 가깝게 나왔어요\n"
            f"{best*100:.1f}%  ·  다음 후보 {second_region} {second*100:.1f}%"
        )
        self.result_box.setVisible(True)
        self.retry_btn.setVisible(True)
        self.record_btn.setVisible(False)
        self.analyze_btn.setVisible(False)
        self.status.setText("분석 완료")

    def retry(self):
        candidates = [x for x in PROMPTS if x != self.prompt]
        self.prompt = random.choice(candidates or PROMPTS)
        self.prompt_label.setText(self.prompt)
        for bar in self.bars.values():
            bar.setValue(0)
        self.result_box.setVisible(False)
        self.retry_btn.setVisible(False)
        self.record_btn.setVisible(True)
        self.analyze_btn.setVisible(True)
        self.record_btn.setEnabled(self.classifier is not None)
        self.analyze_btn.setEnabled(False)
        self.status.setText("새 문장입니다. 녹음 시작을 눌러주세요.")

    def on_error(self, msg):
        self.record_btn.setEnabled(self.classifier is not None)
        self.analyze_btn.setEnabled(False)
        self.status.setText("오류가 발생했습니다.")
        QMessageBox.critical(self, "오류", msg)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    w = App()
    w.show()
    sys.exit(app.exec())
