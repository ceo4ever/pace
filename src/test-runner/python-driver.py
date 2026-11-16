import json
import os
import sys
import unittest

sys.path.insert(0, os.getcwd())
path = os.path.abspath(sys.argv[1])
try:
    suite = unittest.defaultTestLoader.discover(os.path.dirname(path), pattern=os.path.basename(path), top_level_dir=os.path.dirname(path))
    result = unittest.TextTestRunner(stream=sys.stderr).run(suite)
    payload = {'tests': result.testsRun, 'skipped': len(result.skipped), 'failed': len(result.failures) + len(result.errors), 'success': result.wasSuccessful()}
    os.write(3, json.dumps(payload).encode())
except BaseException as exc:
    print(type(exc).__name__, str(exc), file=sys.stderr)
    sys.exit(1)
