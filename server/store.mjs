// 极简 JSON 文件存储：内存里读写，延迟 200ms 原子落盘（先写临时文件再改名），退出前强制落盘。
import fs from 'node:fs';
import path from 'node:path';

const instances = new Set();

export class JsonFile {
  constructor(file, initial) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.data = initial(); }
    this.timer = null;
    instances.add(this);
  }
  touch() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 200);
    this.timer.unref?.();
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
  close() { if (this.timer) this.flush(); instances.delete(this); }
}

export function flushAll() { for (const i of instances) if (i.timer) i.flush(); }
process.on('exit', flushAll);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flushAll(); process.exit(0); });
