"""Create or update the first CovaVision administrator from environment variables."""

from __future__ import annotations

import asyncio
import getpass
import os

from app.db.repository import PrismaRepository


async def run() -> None:
    username = (os.getenv("COVAVISION_BOOTSTRAP_USERNAME") or input("Username: ")).strip()
    password = os.getenv("COVAVISION_BOOTSTRAP_PASSWORD") or getpass.getpass("Password: ")
    role = (os.getenv("COVAVISION_BOOTSTRAP_ROLE") or "ADMIN").strip().upper()
    if not username or not password:
        raise SystemExit("Username and password are required.")

    repository = PrismaRepository()
    try:
        account = await repository.save_account({
            "username": username,
            "password": password,
            "role": role,
            "is_active": True,
        })
        print(f"CovaVision account ready: {account['username']} ({account['role']})")
    finally:
        if repository._connected:
            await repository.client.disconnect()


if __name__ == "__main__":
    asyncio.run(run())
