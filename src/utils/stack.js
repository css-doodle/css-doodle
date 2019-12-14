class Node {
  constructor(data) {
    this.prev = this.next = null;
    this.data = data;
  }
}

export default class Stack {
  constructor(limit = 20) {
    this._limit = limit;
    this._size = 0;
  }

  push(data) {
    if (this._size >= this._limit) {
      this.root = this.root.next;
      this.root.prev = null;
    }

    let node = new Node(data);

    if (!this.root) {
      this.root = this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }

    this._size++;
  }

  last(n = 1) {
    let node = this.tail;
    while (--n) {
      if (!node.prev) break;
      node = node.prev;
    }
    return node.data;
  }
}
