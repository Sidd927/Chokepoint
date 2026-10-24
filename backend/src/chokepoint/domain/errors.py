class ScenarioError(ValueError):
    def __init__(self, message: str, code: str = "INVALID_SCENARIO", path: str = ""):
        super().__init__(message)
        self.code, self.path = code, path
