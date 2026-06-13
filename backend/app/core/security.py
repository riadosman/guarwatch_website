import hashlib
import hmac


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_token_hash(stored_hash: str, presented: str) -> bool:
    presented_hash = hash_token(presented)
    return hmac.compare_digest(stored_hash.encode(), presented_hash.encode())


# kept for backward compat during transition
def verify_device_token(token_map: dict[str, str], device_id: str, presented: str) -> bool:
    expected = token_map.get(device_id)
    if expected is None:
        return False
    return hmac.compare_digest(expected.encode(), presented.encode())
