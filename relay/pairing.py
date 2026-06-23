import json
import os
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

PAIRING_TTL_SECONDS = 600  # 10 dakika
PERSIST_PATH = os.getenv("PAIRING_STATE_FILE", "/tmp/gw_pairing.json")


@dataclass
class _Entry:
    device_id: str
    created_at: float = field(default_factory=time.time)


class PairingService:
    def __init__(self):
        self._codes: dict[str, _Entry] = {}
        self._load()

    # ── Kalıcı depolama ──────────────────────────────────────

    def _load(self) -> None:
        """Relay yeniden başladığında mevcut (süresi dolmamış) kodları yükle."""
        try:
            with open(PERSIST_PATH) as f:
                raw: dict = json.load(f)
            now = time.time()
            for code, entry in raw.items():
                if now - entry["created_at"] < PAIRING_TTL_SECONDS:
                    self._codes[code] = _Entry(
                        device_id=entry["device_id"],
                        created_at=entry["created_at"],
                    )
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            pass

    def _save(self) -> None:
        try:
            data = {
                code: {"device_id": e.device_id, "created_at": e.created_at}
                for code, e in self._codes.items()
            }
            tmp = PERSIST_PATH + ".tmp"
            with open(tmp, "w") as f:
                json.dump(data, f)
            os.replace(tmp, PERSIST_PATH)
        except OSError:
            pass

    # ── Ana API ──────────────────────────────────────────────

    def generate_code(self, device_id: str) -> str:
        """Cihaz için yeni kod üret (eskisini sil)."""
        self._codes = {
            c: e for c, e in self._codes.items()
            if e.device_id != device_id
        }
        code = secrets.token_hex(3).upper()  # örn. "A1B2C3"
        self._codes[code] = _Entry(device_id=device_id)
        self._save()
        return code

    def validate(self, code: str) -> Optional[str]:
        """Kodu doğrula ama tüketme."""
        normalized = code.upper().replace("-", "")
        entry = self._codes.get(normalized)
        if entry is None:
            return None
        if time.time() - entry.created_at > PAIRING_TTL_SECONDS:
            del self._codes[normalized]
            self._save()
            return None
        return entry.device_id

    def consume(self, code: str) -> None:
        self._codes.pop(code.upper().replace("-", ""), None)
        self._save()

    def validate_and_consume(self, code: str) -> Optional[str]:
        device_id = self.validate(code)
        if device_id:
            self.consume(code)
        return device_id
