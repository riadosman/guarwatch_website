import hmac


def verify_device_token(token_map: dict[str, str], device_id: str, presented: str) -> bool:
    expected = token_map.get(device_id)
    if expected is None:
        return False
    return hmac.compare_digest(expected.encode(), presented.encode())
