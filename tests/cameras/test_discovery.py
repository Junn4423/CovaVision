from app.camera.discovery import (
    detect_camera_brand,
    generate_smart_rtsp_urls,
    parse_onvif_probe_response,
    public_discovery_candidate,
)


def test_parse_onvif_response_classifies_brand_without_public_network_details() -> None:
    xml = """
    <ProbeMatch>
      <wsa:EndpointReference><wsa:Address>urn:uuid:test-camera</wsa:Address></wsa:EndpointReference>
      <d:XAddrs>http://192.168.10.25:8899/onvif/device_service</d:XAddrs>
      <d:Scopes>
        onvif://www.onvif.org/type/video_encoder
        onvif://www.onvif.org/hardware/DS-2CD2143G2-I
        onvif://www.onvif.org/name/Front_Camera
        onvif://www.onvif.org/manufacturer/Hikvision
      </d:Scopes>
    </ProbeMatch>
    """

    candidate = parse_onvif_probe_response(xml, "192.168.10.25")

    assert candidate is not None
    assert candidate["brand"] == "Hikvision"
    assert candidate["name"] == "Front Camera"
    assert candidate["ip"] == "192.168.10.25"
    public = public_discovery_candidate(candidate)
    assert public["id"] == candidate["id"]
    assert "ip" not in public
    assert "xaddr" not in public
    assert "192.168.10.25" not in str(public)


def test_mobile_brand_rules_and_rtsp_presets_are_preserved() -> None:
    assert detect_camera_brand([], "IPC-A22", "") == "Imou"
    urls = generate_smart_rtsp_urls(
        {"ip": "10.10.2.7", "brand": "Dahua"},
        username="camera user",
        password="p@ss word",
    )

    assert urls["main"] == "rtsp://camera%20user:p%40ss%20word@10.10.2.7:554/cam/realmonitor?channel=1&subtype=0"
    assert urls["sub"].endswith("subtype=1")
