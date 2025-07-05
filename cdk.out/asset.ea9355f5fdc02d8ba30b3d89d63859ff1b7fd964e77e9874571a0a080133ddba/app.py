import os
import requests  # Keep it
from typing import Any
import datetime as dt
import boto3
import json
    

LOG_BUCKET = os.environ['LOG_BUCKET']


def save_to_s3(data: dict[str, Any], filename: str):
    """Save data to the s3 bucket.

    Parameters
    ----------
    data: dict[str, Any]
        The data to save to s3 bucket.
    filename: str
        The full object name for the file.
    """

    s3_client = boto3.client('s3')
    
    # Convert data to JSON string
    json_data = json.dumps(data, indent=2)
    
    # Upload to S3
    s3_client.put_object(
        Bucket=LOG_BUCKET,
        Key=f"{filename}.json",
        Body=json_data,
        ContentType='application/json'
    )
    
    print(f"Data saved to S3: {LOG_BUCKET}/{filename}.json")


def lambda_handler(event, context):
    """Process order result."""
    if event["status"] == "rejected":
        raise ValueError("Order status is rejected!")
    save_to_s3(data=event, filename=f"orders/order_{dt.datetime.now(dt.timezone.utc).isoformat()}")
