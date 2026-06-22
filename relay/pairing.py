import secrets
import time
from dataclasses import dataclass, field
from typing import Optional


PAIRING_TTL_SECONDS = 600  # 10 dakika


@dataclass
class _Entry:
    device_id: str
    created_at: float = field(default_factory=time.time)


class PairingService:
    def __init__(self):
        self._codes: dict[str, _Entry] = {}

    def generate_code(self, device_id: str) -> str:
        # Aynı cihazın eski kodunu sil
        self._codes = {
            c: e for c, e in self._codes.items()
            if e.device_id != device_id
        }
        code = secrets.token_hex(3).upper()  # örn. "A1B2C3"
        self._codes[code] = _Entry(device_id=device_id)
        return code

    def validate(self, code: str) -> Optional[str]:
        """Kodu doğrula ama tüketme — backend kaydı başarılıysa consume() çağır."""
        normalized = code.upper()
        entry = self._codes.get(normalized)
        if entry is None:
            return None
        if time.time() - entry.created_at > PAIRING_TTL_SECONDS:
            del self._codes[normalized]
            return None
        return entry.device_id

    def consume(self, code: str) -> None:
        self._codes.pop(code.upper(), None)

    def validate_and_consume(self, code: str) -> Optional[str]:
        device_id = self.validate(code)
        if device_id:
            self.consume(code)
        return device_id
