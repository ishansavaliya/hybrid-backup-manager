"""Real subprocess backup/recovery smoke test. All data lives in a temporary fixture."""
import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--agent', required=True)
parser.add_argument('--restic', required=True)
args = parser.parse_args()
agent = str(Path(args.agent).resolve())
restic = str(Path(args.restic).resolve())
with tempfile.TemporaryDirectory(prefix='bakvion-cli-test-') as folder:
    root = Path(folder)
    source = root / 'documents'
    source.mkdir()
    (source / 'report.txt').write_text('Actual CLI backup and recovery fixture.')
    password = root / 'password'
    password.write_text(os.urandom(32).hex())
    password.chmod(0o600)
    state = root / 'private' / 'agent.db'
    common = [agent, '--restic', restic, '--state', str(state)]

    def request(method, params=None):
        result = subprocess.run(common + ['request'], input=json.dumps({'version': 1, 'method': method, 'params': params}), text=True, capture_output=True, check=True)
        payload = json.loads(result.stdout)
        if 'error' in payload:
            raise AssertionError(payload['error'])
        return payload['result']

    request('savePlan', {'id': 'smoke', 'name': 'CLI fixture', 'sources': [str(source)], 'exclusions': [], 'destinations': [{'id': 'local', 'name': 'Local', 'repository': str(root / 'repository'), 'passwordFile': str(password)}]})
    params = {'planId': 'smoke', 'destinationId': 'local'}
    request('testDestination', params)
    request('initRepository', params)
    request('startBackup', {'planId': 'smoke'})
    subprocess.run(common + ['work'], check=True)
    overview = request('overview')
    assert overview['executions'][0]['state'] == 'succeeded', overview
    snapshot = overview['executions'][0]['snapshotId']
    # No state argument and no browser or hosted connection is used for recovery.
    recovered = root / 'recovered'
    result = subprocess.run([agent, '--restic', restic, '--repo', str(root / 'repository'), '--password-file', str(password), '--snapshot', snapshot, '--target', str(recovered), 'recover'], capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)['verifiedFiles'] == 1
    files = list(recovered.rglob('report.txt'))
    assert len(files) == 1 and files[0].read_text() == (source / 'report.txt').read_text()
print('PASS: real CLI plan -> init -> queue -> backup -> fresh-state verified recovery')
