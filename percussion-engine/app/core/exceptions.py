# exceptions.py
class DerboukaError(Exception):
    """Base exception for Derbouka application"""
    pass

class ConfigurationError(DerboukaError):
    """Configuration error"""
    pass

class SampleNotFoundError(DerboukaError):
    """Sample file not found"""
    pass

class AudioGenerationError(DerboukaError):
    """Error during audio generation"""
    pass

class AuthenticationError(DerboukaError):
    """Authentication error"""
    pass

class StorageError(DerboukaError):
    """Storage error (S3/DB)"""
    pass

class ValidationError(DerboukaError):
    """Input validation error"""
    pass