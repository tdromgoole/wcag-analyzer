"""Test-profile-only restriction for the pinned Guidepup NVDA relay."""
import globalPluginHandler
from _remoteClient import server


class GlobalPlugin(globalPluginHandler.GlobalPlugin):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.original = server.LocalRelayServer
        original = self.original

        class LoopbackRelay(original):
            def __init__(self, port, password, *args, **kwargs):
                super().__init__(port, password, bindHost="127.0.0.1", bindHost6="::1")

        self.replacement = LoopbackRelay
        server.LocalRelayServer = self.replacement

    def terminate(self):
        if server.LocalRelayServer is self.replacement:
            server.LocalRelayServer = self.original
        super().terminate()
