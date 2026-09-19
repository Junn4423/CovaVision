"""LAN camera discovery shared by the desktop and mobile clients.

The implementation follows the proven mobile flow: ONVIF WS-Discovery first,
then an optional /24 TCP probe fallback. Discovery is deliberately backend-only
so camera IPs, RTSP URLs and credentials never need to cross the API boundary.
"""

from __future__ import annotations

import ipaddress
import re
import socket
import threading
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote, unquote, urlsplit
from uuid import uuid4

ONVIF_PORT = 3702
ONVIF_MULTICAST_HOST = "239.255.255.250"
ONVIF_BROADCAST_HOST = "255.255.255.255"
_CANDIDATE_TTL = timedelta(minutes=10)
_MAX_CANDIDATES = 256


def _uuid() -> str:
    return str(uuid4())


def build_onvif_probe_xml(message_id: str, device_type: str = "dn:NetworkVideoTransmitter") -> bytes:
    xml = "".join([
        '<?xml version="1.0" encoding="UTF-8"?>',
        ('<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" '
         'xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing">'),
        "<s:Header>",
        ('<a:Action s:mustUnderstand="1">'
         "http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action>"),
        f"<a:MessageID>uuid:{message_id}</a:MessageID>",
        ("<a:ReplyTo><a:Address>"
         "http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous"
         "</a:Address></a:ReplyTo>"),
        '<a:To s:mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To>',
        "</s:Header><s:Body>",
        '<Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">',
        f'<Types xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">{device_type}</Types>',
        "</Probe></s:Body></s:Envelope>",
    ])
    return xml.encode("utf-8")


def detect_camera_brand(scopes: Iterable[str], model: str, manufacturer: str) -> str:
    text = f"{' '.join(scopes)} {model} {manufacturer}".lower()
    if any(value in text for value in ("ezviz", "cs-", "c6n", "c3w")):
        return "EZVIZ"
    if any(value in text for value in ("hikvision", "ds-2cd", "ds-2cv", "hik")):
        return "Hikvision"
    if any(value in text for value in ("imou", "ranger", "cruiser", "ipc-a")):
        return "Imou"
    if any(value in text for value in ("dahua", "dh-", "ipc-hfw", "ipc-hdw")):
        return "Dahua"
    if any(value in text for value in ("uniview", "unv")):
        return "Uniview"
    if any(value in text for value in ("yoosee", "xiongmai", "xm_")):
        return "Yoosee"
    if "onvif" in text:
        return "ONVIF"
    return "Khác"


def _xml_text(xml: str, local_name: str) -> str:
    pattern = re.compile(
        rf"<(?:[A-Za-z_][\w.-]*:)?{re.escape(local_name)}\b[^>]*>(.*?)</"
        rf"(?:[A-Za-z_][\w.-]*:)?{re.escape(local_name)}>",
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(xml)
    return re.sub(r"\s+", " ", match.group(1)).strip() if match else ""


def _valid_host(value: str) -> str:
    host = value.strip()
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        if re.fullmatch(r"[A-Za-z0-9.-]{1,253}", host):
            return host
    return ""


def parse_onvif_probe_response(xml_string: str, remote_ip: str) -> dict[str, Any] | None:
    """Parse the ONVIF response shape used by the old mobile discovery service."""
    try:
        urn = _xml_text(xml_string, "Address") or f"urn:uuid:{_uuid()}"
        xaddrs_raw = _xml_text(xml_string, "XAddrs")
        xaddr = xaddrs_raw.split()[0] if xaddrs_raw else ""
        ip = _valid_host(remote_ip)
        port = 80
        if xaddr:
            parsed = urlsplit(xaddr)
            parsed_host = _valid_host(parsed.hostname or "")
            if parsed_host:
                ip = parsed_host
            port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
        if not ip:
            return None

        scopes_raw = _xml_text(xml_string, "Scopes")
        scopes = scopes_raw.split() if scopes_raw else []
        decoded_scopes = [unquote(scope) for scope in scopes]
        name = ""
        hardware = ""
        location = ""
        manufacturer = ""
        for scope in decoded_scopes:
            if scope.startswith("onvif://www.onvif.org/hardware/"):
                hardware = scope.rsplit("/", 1)[-1]
            elif scope.startswith("onvif://www.onvif.org/name/"):
                name = scope.rsplit("/", 1)[-1].replace("_", " ")
            elif scope.startswith("onvif://www.onvif.org/location/"):
                location = scope.rsplit("/", 1)[-1]
            elif scope.startswith("onvif://www.onvif.org/manufacturer/"):
                manufacturer = scope.rsplit("/", 1)[-1]

        brand = detect_camera_brand(decoded_scopes, hardware, manufacturer or name)
        return {
            "id": f"discovery_{uuid4().hex}",
            "ip": ip,
            "port": port,
            "xaddr": xaddr or f"http://{ip}:{port}/onvif/device_service",
            "urn": urn,
            "name": name or f"{brand} Camera",
            "model": hardware or (f"{brand} Camera" if brand != "Khác" else "Camera IP ONVIF"),
            "brand": brand,
            "manufacturer": manufacturer or brand,
            "location": location or None,
            "discovery_method": "onvif",
            "scopes": decoded_scopes,
            "open_ports": sorted({554, port}),
            "discovered_at": datetime.now(timezone.utc).isoformat(),
        }
    except (ValueError, TypeError):
        return None


def generate_smart_rtsp_urls(
    camera: dict[str, Any], username: str = "admin", password: str = ""
) -> dict[str, Any]:
    host = _valid_host(str(camera.get("ip") or ""))
    if not host:
        raise ValueError("Camera discovery candidate không có host hợp lệ")
    encoded_username = quote(username, safe="")
    encoded_password = quote(password, safe="")
    credentials = ""
    if encoded_username:
        credentials = encoded_username + (f":{encoded_password}" if password else "") + "@"
    base = f"rtsp://{credentials}{host}:554"
    brand = str(camera.get("brand") or "").lower()

    if brand == "hikvision":
        return {
            "main": f"{base}/Streaming/Channels/101",
            "sub": f"{base}/Streaming/Channels/102",
            "alternatives": [
                {"label": "Luồng chính H.264", "url": f"{base}/h264/ch1/main/av_stream"},
                {"label": "Luồng phụ H.264", "url": f"{base}/h264/ch1/sub/av_stream"},
                {"label": "Kênh 1 chuẩn ONVIF", "url": f"{base}/ch1/main"},
            ],
        }
    if brand == "ezviz":
        return {
            "main": f"{base}/Streaming/Channels/101",
            "sub": f"{base}/Streaming/Channels/102",
            "alternatives": [
                {"label": "Luồng chính chuẩn EZVIZ", "url": f"{base}/h264/ch1/main/av_stream"},
                {"label": "Luồng phụ chuẩn EZVIZ", "url": f"{base}/h264/ch1/sub/av_stream"},
            ],
        }
    if brand in {"dahua", "imou"}:
        return {
            "main": f"{base}/cam/realmonitor?channel=1&subtype=0",
            "sub": f"{base}/cam/realmonitor?channel=1&subtype=1",
            "alternatives": [
                {"label": "Dahua TCP Live", "url": f"{base}/live?channel=1&subtype=0"},
                {"label": "ONVIF tương thích", "url": f"{base}/ch1/main"},
            ],
        }
    if brand == "uniview":
        return {
            "main": f"{base}/unicast/c1/s0/live",
            "sub": f"{base}/unicast/c1/s1/live",
            "alternatives": [{"label": "Chuẩn ONVIF Uniview", "url": f"{base}/ch1/main"}],
        }
    if brand == "yoosee":
        return {
            "main": f"{base}/onvif1",
            "sub": f"{base}/onvif2",
            "alternatives": [{"label": "Luồng live RTSP", "url": f"{base}/live/ch0"}],
        }
    return {
        "main": f"{base}/ch1/main",
        "sub": f"{base}/ch1/sub",
        "alternatives": [
            {"label": "Hikvision/EZVIZ format", "url": f"{base}/Streaming/Channels/101"},
            {"label": "Dahua format", "url": f"{base}/cam/realmonitor?channel=1&subtype=0"},
            {"label": "Generic live ch0", "url": f"{base}/live/ch0"},
        ],
    }


def public_discovery_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    """Return display metadata without network coordinates or connection data."""
    return {
        "id": str(candidate["id"]),
        "name": str(candidate.get("name") or "Camera"),
        "model": str(candidate.get("model") or "Camera IP"),
        "brand": str(candidate.get("brand") or "Khác"),
        "manufacturer": str(candidate.get("manufacturer") or ""),
        "discovery_method": str(candidate.get("discovery_method") or "onvif"),
        "camera_type": "rtsp",
    }


class CameraDiscoveryService:
    def __init__(self) -> None:
        self._candidates: dict[str, tuple[datetime, dict[str, Any]]] = {}
        self._lock = threading.Lock()

    def _store(self, candidates: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc)
        with self._lock:
            self._candidates = {
                key: value for key, value in self._candidates.items() if value[0] > now
            }
            stored = []
            for candidate in candidates:
                candidate_id = str(candidate.get("id") or f"discovery_{uuid4().hex}")
                candidate["id"] = candidate_id
                self._candidates[candidate_id] = (now + _CANDIDATE_TTL, dict(candidate))
                stored.append(candidate)
            if len(self._candidates) > _MAX_CANDIDATES:
                expired_or_old = sorted(self._candidates.items(), key=lambda item: item[1][0])
                for candidate_id, _ in expired_or_old[: len(self._candidates) - _MAX_CANDIDATES]:
                    self._candidates.pop(candidate_id, None)
            return stored

    def _discover_onvif(self, timeout_ms: int) -> list[dict[str, Any]]:
        found: dict[str, dict[str, Any]] = {}
        packet_types = ("dn:NetworkVideoTransmitter", "tds:Device")
        targets = (ONVIF_MULTICAST_HOST, ONVIF_BROADCAST_HOST)
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        try:
            sock.bind(("", 0))
            for target in targets:
                for device_type in packet_types:
                    try:
                        sock.sendto(build_onvif_probe_xml(_uuid(), device_type), (target, ONVIF_PORT))
                    except OSError:
                        # A blocked multicast route must not prevent broadcast discovery.
                        continue
            deadline = datetime.now(timezone.utc).timestamp() + max(1500, min(timeout_ms, 10000)) / 1000
            sock.settimeout(0.2)
            while datetime.now(timezone.utc).timestamp() < deadline:
                try:
                    packet, address = sock.recvfrom(65535)
                except TimeoutError:
                    continue
                except OSError:
                    break
                candidate = parse_onvif_probe_response(packet.decode("utf-8", errors="ignore"), address[0])
                if candidate and candidate["ip"] not in found:
                    found[candidate["ip"]] = candidate
        finally:
            sock.close()
        return list(found.values())

    @staticmethod
    def _normalise_subnet(subnet_base: str) -> ipaddress.IPv4Network:
        value = str(subnet_base or "").strip()
        if not value:
            raise ValueError("subnet_base là bắt buộc khi bật quét subnet")
        if "/" not in value:
            value = value.rstrip(".") + ".0/24"
        network = ipaddress.ip_network(value, strict=False)
        if network.version != 4 or network.prefixlen != 24 or not network.is_private:
            raise ValueError("Chỉ hỗ trợ subnet LAN IPv4 private dạng /24")
        return network

    @staticmethod
    def _probe_http(ip: str, port: int = 80, timeout: float = 0.7) -> bool:
        try:
            with socket.create_connection((ip, port), timeout=timeout):
                return True
        except OSError:
            return False

    def _subnet_scan(self, subnet_base: str) -> list[dict[str, Any]]:
        network = self._normalise_subnet(subnet_base)
        found: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=32) as executor:
            futures = {
                executor.submit(self._probe_http, str(host)): str(host)
                for host in network.hosts()
            }
            for future in as_completed(futures):
                ip = futures[future]
                if not future.result():
                    continue
                found.append({
                    "id": f"discovery_{uuid4().hex}",
                    "ip": ip,
                    "port": 80,
                    "xaddr": f"http://{ip}:80/onvif/device_service",
                    "urn": f"urn:uuid:{_uuid()}",
                    "name": "Camera IP",
                    "model": "Camera IP",
                    "brand": "ONVIF",
                    "manufacturer": "Tự động phát hiện",
                    "location": None,
                    "discovery_method": "subnet-scan",
                    "scopes": [],
                    "open_ports": [80, 554],
                    "discovered_at": datetime.now(timezone.utc).isoformat(),
                })
        return found

    def discover(
        self,
        timeout_ms: int = 3500,
        subnet_base: str | None = None,
        enable_subnet_fallback: bool = False,
    ) -> list[dict[str, Any]]:
        cameras = {candidate["ip"]: candidate for candidate in self._discover_onvif(timeout_ms)}
        if enable_subnet_fallback:
            for candidate in self._subnet_scan(subnet_base or ""):
                cameras.setdefault(candidate["ip"], candidate)
        result = list(cameras.values())
        result.sort(key=lambda candidate: (
            candidate.get("discovery_method") != "onvif",
            str(candidate.get("ip") or ""),
        ))
        return self._store(result)

    def get_candidate(self, candidate_id: str) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc)
        with self._lock:
            stored = self._candidates.get(candidate_id)
            if stored is None or stored[0] <= now:
                self._candidates.pop(candidate_id, None)
                return None
            return dict(stored[1])

    def resolve_candidate(
        self,
        candidate_id: str,
        username: str = "admin",
        password: str = "",
        preset: str = "main",
        custom_url: str = "",
    ) -> dict[str, Any]:
        candidate = self.get_candidate(candidate_id)
        if candidate is None:
            raise KeyError(candidate_id)
        username = str(username or "admin").strip()
        password = str(password or "")
        if custom_url.strip():
            connection_url = custom_url.strip()
            if not connection_url.lower().startswith(("rtsp://", "rtsps://")):
                raise ValueError("custom_url phải bắt đầu bằng rtsp:// hoặc rtsps://")
        else:
            urls = generate_smart_rtsp_urls(candidate, username, password)
            connection_url = urls.get("sub" if preset == "sub" else "main", urls["main"])
        return {
            "connection_url": connection_url,
            "username": username,
            "password": password,
            "name": str(candidate.get("name") or "Camera"),
            "camera_type": "rtsp",
        }
