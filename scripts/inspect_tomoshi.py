#!/usr/bin/env python3
import sqlite3
from pathlib import Path

DB = Path('/tmp/tomoshi-dict-open.db')
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

wanted = ['entries', 'forms', 'zh_defs_zhtw', 'vocab_jlpt', 'freq_rank', 'table_licenses']
print('TABLES')
print([row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")])
for table in wanted:
    print(f'\n=== {table} schema ===')
    try:
        print([tuple(row) for row in conn.execute(f'PRAGMA table_info({table})')])
        print(f'=== {table} sample ===')
        rows = conn.execute(f'SELECT * FROM {table} LIMIT 3').fetchall()
        for row in rows:
            print(dict(row))
    except sqlite3.Error as exc:
        print('ERROR', exc)
