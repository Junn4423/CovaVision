from __future__ import annotations

import pytest

from app.camera.discovery import (
    CameraDiscoveryService,
    _valid_host,
    build_onvif_probe_xml,
    detect_camera_brand,
    generate_smart_rtsp_urls,
    parse_onvif_probe_response,
    public_discovery_candidate,
)


def test_onvif_probe_response_extracts_safe_camera_metadata() -> None:
    xml = """
    <ProbeMatches><ProbeMatch>
      <a:Address xmlns:a="urn">urn:uuid:test</a:Address>
      <a:XAddrs xmlns:a="urn">http://192.168.1.20:8080/onvif/device_service</a:XAddrs>
      <a:Scopes xmlns:a="urn">
        onvif://www.onvif.org/hardware/DS-2CD
        onvif://www.onvif.org/name/Warehouse_Camera
        onvif://www.onvif.org/manufacturer/Hikvision
      </a:Scopes>
    </ProbeMatch></ProbeMatches>
    """
    parsed = parse_onvif_probe_response(xml, "192.168.1.99")
    assert parsed is not None
    assert parsed["ip"] == "192.168.1.20"
    assert parsed["port"] == 8080
    assert parsed["brand"] == "Hikvision"
    assert parsed["name"] == "Warehouse Camera"
    assert "192.168.1.20" not in str(public_discovery_candidate(parsed))

    assert b"NetworkVideoTransmitter" in build_onvif_probe_xml("message-1")
    assert parse_onvif_probe_response("<broken>", "not a host") is None


@pytest.mark.parametrize(
    ("scopes", "model", "manufacturer", "expected"),
    [
        (["ezviz"], "", "", "EZVIZ"),
        (["hik"], "", "", "Hikvision"),
        (["imou"], "", "", "Imou"),
        (["dahua"], "", "", "Dahua"),
        (["unv"], "", "", "Uniview"),
        (["yoosee"], "", "", "Yoosee"),
        (["onvif"], "", "", "ONVIF"),
    ],
)
def test_camera_brand_rules(scopes, model, manufacturer, expected) -> None:
    assert detect_camera_brand(scopes, model, manufacturer) == expected


def test_rtsp_url_presets_and_host_validation() -> None:
    assert _valid_host("192.168.1.20") == "192.168.1.20"
    assert _valid_host("camera.local") == "camera.local"
    assert _valid_host("bad host") == ""
    assert generate_smart_rtsp_urls(
        {"ip": "192.168.1.20", "brand": "dahua"}, "user", "p@ss"
    )["sub"].endswith("subtype=1")
    with pytest.raises(ValueError):
        generate_smart_rtsp_urls({"ip": ""})


def test_discovery_candidate_lifecycle_and_custom_url_validation() -> None:
    service = CameraDiscoveryService()
    stored = service._store([{
        "id": "candidate-1",
        "ip": "192.168.1.20",
        "brand": "Hikvision",
        "name": "Warehouse",
    }])
    assert stored[0]["id"] == "candidate-1"
    assert service.get_candidate("candidate-1")["ip"] == "192.168.1.20"
    resolved = service.resolve_candidate("candidate-1", username="admin", password="secret", preset="sub")
    assert "/Streaming/Channels/102" in resolved["connection_url"]
    custom = service.resolve_candidate(
        "candidate-1",
        custom_url="rtsps://camera.example/live",
    )
    assert custom["connection_url"].startswith("rtsps://")
    with pytest.raises(ValueError):
        service.resolve_candidate("candidate-1", custom_url="https://not-rtsp")
    with pytest.raises(KeyError):
        service.resolve_candidate("missing")
