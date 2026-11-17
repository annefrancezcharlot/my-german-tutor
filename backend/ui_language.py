"""Per-request interface language ("en" or "fr").

The frontend sends the learner's chosen interface language in the
``X-UI-Language`` header. A pure ASGI middleware stores it in a context
variable so prompt builders can write explanations, hints and notes in the
learner's language without threading a parameter through every router.
"""

from contextvars import ContextVar
from typing import Literal

UiLanguage = Literal["en", "fr"]

SUPPORTED_UI_LANGUAGES = ("en", "fr")
DEFAULT_UI_LANGUAGE: UiLanguage = "en"
UI_LANGUAGE_HEADER = b"x-ui-language"

_LANGUAGE_NAMES = {"en": "English", "fr": "French"}

_current_ui_language: ContextVar[str] = ContextVar("ui_language", default=DEFAULT_UI_LANGUAGE)


def normalize_ui_language(value: object) -> UiLanguage:
    if isinstance(value, str):
        code = value.strip().lower()[:2]
        if code in SUPPORTED_UI_LANGUAGES:
            return code  # type: ignore[return-value]
    return DEFAULT_UI_LANGUAGE


def get_ui_language() -> UiLanguage:
    return normalize_ui_language(_current_ui_language.get())


def set_ui_language(value: object):
    """Set the language for the current context; returns a token for reset()."""
    return _current_ui_language.set(normalize_ui_language(value))


def reset_ui_language(token) -> None:
    _current_ui_language.reset(token)


def ui_language_name() -> str:
    """Language name for prompts, e.g. "English" or "French"."""
    return _LANGUAGE_NAMES[get_ui_language()]


def localized(en: str, fr: str) -> str:
    return fr if get_ui_language() == "fr" else en


class UiLanguageMiddleware:
    """Reads X-UI-Language and exposes it through get_ui_language()."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        header_value = None
        for name, value in scope.get("headers", []):
            if name == UI_LANGUAGE_HEADER:
                header_value = value.decode("latin-1")
                break

        token = set_ui_language(header_value)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_ui_language(token)
