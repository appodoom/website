# storage.py
import aioboto3
import aiofiles
import json
import asyncio
from typing import Optional, Dict, Any
import logging
from botocore.config import Config
from botocore.exceptions import ClientError
from app.core.config import settings
from app.db.models import AsyncSessionLocal, Sound
from app.core.exceptions import StorageError
from sqlalchemy.exc import SQLAlchemyError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

class S3Manager:
    """
    Manages S3 operations with connection pooling and retries.
    """
    
    def __init__(self):
        self.session = aioboto3.Session()
        self._client = None
        self._lock = asyncio.Lock()
        self.config = Config(
            max_pool_connections=settings.S3_MAX_CONNECTIONS,
            retries={'max_attempts': 3, 'mode': 'adaptive'}
        )
    
    async def _get_client(self):
        """Get or create S3 client"""
        async with self._lock:
            if self._client is None:
                self._client = await self.session.client(
                    "s3",
                    region_name=settings.S3_REGION,
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    config=self.config
                ).__aenter__()
            return self._client
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((ClientError, ConnectionError))
    )
    async def upload_file(self, local_path: str, s3_key: str, content_type: str = None) -> str:
        """
        Upload a file to S3 with retries.
        """
        try:
            client = await self._get_client()
            
            extra_args = {}
            if content_type:
                extra_args['ContentType'] = content_type
            
            async with aiofiles.open(local_path, "rb") as f:
                await client.upload_fileobj(
                    f, 
                    settings.S3_BUCKET, 
                    s3_key,
                    ExtraArgs=extra_args if extra_args else None
                )
            
            logger.info(f"Uploaded {s3_key} to S3")
            
        except ClientError as e:
            logger.error(f"S3 upload failed for {s3_key}: {e}")
            raise StorageError(f"Failed to upload to S3: {e}") from e
    
    async def upload_files_batch(self, file_mappings: Dict[str, str]) -> Dict[str, str]:
        """
        Upload multiple files in parallel.
        file_mappings: {s3_key: local_path}
        Returns: nothing
        """
        tasks = []
        for s3_key, local_path in file_mappings.items():
            content_type = "audio/wav" if s3_key.endswith('.wav') else "application/octet-stream"
            tasks.append(self.upload_file(local_path, s3_key, content_type))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for (_, local_path), result in zip(file_mappings.items(), results):
            if isinstance(result, Exception):
                logger.error(f"Failed to upload {local_path}: {result}")
                #urls[local_path] = None
    
    async def list_files(self) -> list[str]:
        """
        List all files in the S3 bucket.
        Returns: list of S3 keys
        """
        try:
            client = await self._get_client()

            response = await client.list_objects_v2(
                Bucket=settings.S3_BUCKET
            )

            contents = response.get("Contents", [])
            files = [obj["Key"] for obj in contents]

            logger.info(f"Listed {len(files)} files from S3")

            return files

        except ClientError as e:
            logger.error(f"Failed to list S3 files: {e}")
            raise StorageError(f"Failed to list files: {e}") from e
    
    async def get_file(self, file) -> str:
        client = await self._get_client()
        
        response = await client.get_object(
        Bucket=self.bucket_name,
        Key=file
        )

        async with response["Body"] as stream:
            content = await stream.read()

        return content.decode("utf-8")
    
    async def close(self):
        """Close S3 client"""
        if self._client:
            await self._client.__aexit__(None, None, None)
            self._client = None

class DatabaseManager:
    """
    Manages database operations with connection pooling.
    """
    
    async def save_sound(self, sound_id: str, user_id: str, settings_dict: Dict[str, Any], tags: list[str]) -> Sound:
        """
        Save sound metadata to database.
        """
        try:
            async with AsyncSessionLocal() as session:
                sound = Sound(
                    id=sound_id,
                    generated_by=user_id,
                    settings=settings_dict,
                    tags=tags
                )
                session.add(sound)
                await session.commit()
                await session.refresh(sound)
                logger.info(f"Saved sound {sound_id} to database")
                return sound
        except SQLAlchemyError as e:
            logger.error(f"Database error saving sound {sound_id}: {e}")
            raise StorageError(f"Failed to save to database: {e}") from e
    
    async def get_sound(self, sound_id: str) -> Optional[Sound]:
        """
        Get sound by ID.
        """
        try:
            async with AsyncSessionLocal() as session:
                from sqlalchemy import select
                result = await session.execute(
                    select(Sound).where(Sound.id == sound_id)
                )
                return result.scalar_one_or_none()
        except SQLAlchemyError as e:
            logger.error(f"Database error getting sound {sound_id}: {e}")
            raise StorageError(f"Failed to get sound: {e}") from e

# Global instances
s3_manager = S3Manager()
db_manager = DatabaseManager()