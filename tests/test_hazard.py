from cli.hazard import is_hazardous, weather_icon


def test_cold_and_wet():
    assert is_hazardous(4, 0.3, 25) is True


def test_cold_and_dry():
    assert is_hazardous(4, 0, 25) is False


def test_warm_and_wet():
    assert is_hazardous(26, 2, 25) is False


def test_threshold_inclusive():
    assert is_hazardous(25, 1, 25) is True


def test_custom_threshold():
    assert is_hazardous(10, 1, 5) is False


def test_icon():
    assert weather_icon(0) == "☀️"
    assert weather_icon(0.1) == "🌧️"
