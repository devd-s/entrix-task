import logging
import json
import os
from typing import Any

logger = logging.getLogger()

TABLE_NAME = os.environ['TABLE_NAME']


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
