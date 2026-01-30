from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from google.auth.transport import requests
from google.oauth2 import id_token
from app.config import settings

# Password hashing context
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# JWT Configuration
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generate password hash"""
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "type": "access"
    })
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Dict[str, Any]:
    """Verify and decode JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise ValueError("Invalid token")


def verify_google_token(token: str) -> Dict[str, Any]:
    """
    Verify Google OAuth token and return user info
    
    Args:
        token: Google ID token from frontend
        
    Returns:
        Dict containing user info (email, name, sub, picture, etc.)
        
    Raises:
        ValueError: If token is invalid or verification fails
    """
    try:
        # Verify the token
        idinfo = id_token.verify_oauth2_token(
            token,
            requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )
        
        # Verify the token is for our app
        if idinfo['aud'] != settings.GOOGLE_CLIENT_ID:
            raise ValueError("Invalid token audience")
        
        # Verify issuer
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError("Invalid token issuer")
        
        return idinfo
        
    except ValueError as e:
        # Invalid token
        raise ValueError(f"Google token verification failed: {str(e)}")
    except Exception as e:
        # Other errors
        raise ValueError(f"Error verifying Google token: {str(e)}")