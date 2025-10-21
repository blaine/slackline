from pathlib import Path
from types import SimpleNamespace
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from slackline.bot import REQUIRED_BOT_SCOPES, SlacklineApp


class DummyClient:
    def __init__(self, response):
        self._response = response
        self.called_methods = []

    def api_call(self, method, **kwargs):
        self.called_methods.append((method, kwargs))
        assert method == "apps.auth.scopes.list"
        return self._response


def build_app(response):
    app = object.__new__(SlacklineApp)
    app.app = SimpleNamespace(client=DummyClient(response))
    return app


def test_verify_scopes_accepts_union_of_scope_groups():
    response = {
        "ok": True,
        "scopes": {
            "channel": sorted(REQUIRED_BOT_SCOPES)[:3],
            "group": sorted(REQUIRED_BOT_SCOPES)[3:],
        },
    }
    app = build_app(response)

    app._verify_scopes(REQUIRED_BOT_SCOPES)

    assert app.app.client.called_methods == [("apps.auth.scopes.list", {})]


def test_verify_scopes_raises_for_missing_scope():
    missing_scope = next(iter(REQUIRED_BOT_SCOPES))
    remaining_scopes = sorted(REQUIRED_BOT_SCOPES - {missing_scope})
    response = {
        "ok": True,
        "scopes": {
            "channel": remaining_scopes,
        },
    }
    app = build_app(response)

    with pytest.raises(RuntimeError) as excinfo:
        app._verify_scopes(REQUIRED_BOT_SCOPES)

    assert missing_scope in str(excinfo.value)


def test_extract_scopes_handles_flat_list():
    response = {"scopes": list(REQUIRED_BOT_SCOPES)}

    scopes = SlacklineApp._extract_scopes_from_response(response)

    assert scopes == set(REQUIRED_BOT_SCOPES)


def test_extract_scopes_handles_string_scope():
    response = {"scopes": "chat:write"}

    scopes = SlacklineApp._extract_scopes_from_response(response)

    assert scopes == {"chat:write"}
