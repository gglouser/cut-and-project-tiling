from argparse import ArgumentParser
from pathlib import Path
import shutil

arg_parser = ArgumentParser()
arg_parser.add_argument('--clean', action='store_true',
    help='remove existing dist directory first')
args = arg_parser.parse_args()

root_dir = Path.cwd()
dist_dir = root_dir / 'dist'

if args.clean and dist_dir.exists():
    shutil.rmtree(dist_dir)

if not dist_dir.exists():
    dist_dir.mkdir()

shutil.copy(root_dir / 'index.html', dist_dir)

subdirs = ['css', 'docs', 'images', 'js', 'pkg']
for subdir in subdirs:
    shutil.copytree(root_dir / subdir, dist_dir / subdir, dirs_exist_ok=True)
