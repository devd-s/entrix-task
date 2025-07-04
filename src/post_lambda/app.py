import logging
import json
import os
from decimal import Decimal
from typing import Any

logger = logging.getLogger()

TABLE_NAME = os.environ['TABLE_NAME']


def convert_floats_to_decimal(obj):
    """Convert float values to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {key: convert_floats_to_decimal(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    return obj


def save_to_db(records: list[dict[str, Any]]):
    """Save records to the table.

    Parameters
    ----------
    records: list[dict[str, Any]]
        The data to save to Table.
    """
    import boto3
    import time
    
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(TABLE_NAME)
    
    # Add TTL (24 hours from now)
    ttl = int(time.time()) + (24 * 60 * 60)
    
    with table.batch_writer() as batch:
        for record in records:
            # Convert floats to Decimal for DynamoDB compatibility
            record = convert_floats_to_decimal(record)
            record['ttl'] = ttl
            batch.put_item(Item=record)
    
    logger.info("Records are successfully saved to the DB table %s.", TABLE_NAME)


def lambda_handler(event, context):
    """Process POST request to the API."""
    logger.info(
        'Received %s request to %s endpoint',
        event["httpMethod"],
        event["path"])

    if (orders := event.get('body')) is not None:
        if isinstance(orders, str):
            orders = json.loads(orders)
        logger.info("Orders received: %s.", orders)
        save_to_db(records=orders)

        return {
            "isBase64Encoded": False,
            "statusCode": 201,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": ""
        }

    return {
        "isBase64Encoded": False,
        "statusCode": 400,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps({"errorMessage": "Request body is empty"})
    }
