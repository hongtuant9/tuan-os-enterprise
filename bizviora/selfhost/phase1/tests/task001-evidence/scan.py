"""Limited pattern scan; prints rule/path/line only, never matched bytes."""
import pathlib,re,subprocess,sys
root=pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
paths=set(subprocess.check_output(['git','ls-files','bizviora/core','bizviora/selfhost/phase1','.github/workflows'],text=True).splitlines())
paths.update(str(p.relative_to(root)) for p in (root/'bizviora/selfhost/phase1/tests').rglob('*') if p.is_file())
rules={
 'private-key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'github-token':re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b'),
 'aws-access-key':re.compile(r'\bAKIA[A-Z0-9]{16}\b'),
 'literal-jwt':re.compile(r'\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b'),
}
hits=0
for name in sorted(paths):
 p=root/name
 if not p.is_file():continue
 for n,line in enumerate(p.read_text(errors='replace').splitlines(),1):
  for rule,pattern in rules.items():
   if pattern.search(line):print(f'FINDING {rule} {name}:{n}');hits+=1
print(f'FILES {len(paths)}; FINDINGS {hits}; limited patterns only, not a credential/history audit')
sys.exit(bool(hits))
