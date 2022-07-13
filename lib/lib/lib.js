"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compare_recursive = exports.hash_of = exports.HashTable = void 0;
class HashTable {
    constructor(n) {
        this._hashtable = new Array(Math.min((typeof n === "number" ? n * 5 : 997), 4992));
    }
    forEach(callback) {
        this._hashtable.forEach((i) => {
            if (i instanceof Object) {
                if (Array.isArray(i)) {
                    i.forEach((j) => { callback(j.key, j.data); });
                }
                else {
                    callback(i.key, i.data);
                }
            }
        });
    }
    add(key, data) {
        const hash = hash_of(key);
        const n = hash % this._hashtable.length;
        if (this._hashtable[n] === undefined) {
            this._hashtable[n] = { hash, key, data };
        }
        else {
            if (Array.isArray(this._hashtable[n])) {
                if (this._hashtable[n].findIndex((r) => (r.hash === hash && compare_recursive(r.key, key))) >= 0) {
                    throw new Error("Key already added.");
                }
            }
            else {
                if (this._hashtable[n].hash === hash &&
                    compare_recursive(this._hashtable[n].key, key)) {
                    throw new Error("Key already added.");
                }
                this._hashtable[n] = [this._hashtable[n]];
            }
            this._hashtable[n].push({ hash, key, data });
        }
    }
    remove(key) {
        const hash = hash_of(key);
        const n = hash % this._hashtable.length;
        const r = this._hashtable[n];
        if (r instanceof Object) {
            if (Array.isArray(r)) {
                for (let i = 0; i < r.length; ++i) {
                    if (r[i].hash === hash && compare_recursive(r[i].key, key)) {
                        r.splice(i, 1);
                        if (r.length === 0) {
                            this._hashtable[n] = undefined;
                        }
                        return true;
                    }
                }
            }
            else {
                if (r.hash === hash && compare_recursive(r.key, key)) {
                    this._hashtable[n] = undefined;
                    return true;
                }
            }
        }
        return false;
    }
    find(key) {
        const hash = hash_of(key);
        const r = this._hashtable[hash % this._hashtable.length];
        if (r instanceof Object) {
            if (Array.isArray(r)) {
                for (let i = 0; i < r.length; ++i) {
                    if (r[i].hash === hash && compare_recursive(r[i].key, key)) {
                        return r[i].data;
                    }
                }
            }
            else {
                if (r.hash === hash && compare_recursive(r.key, key)) {
                    return r.data;
                }
            }
        }
        return null;
    }
}
exports.HashTable = HashTable;
function hash_of(o) {
    switch (typeof o) {
        case "object": {
            let hash = 0;
            if (Array.isArray(o)) {
                o.forEach((i) => { hash ^= hash_of(i); });
            }
            else if (o instanceof Object) {
                for (const prop in o) {
                    if (o.hasOwnProperty(prop)) {
                        hash ^= hash_of(o[prop]);
                    }
                }
            }
            return Math.abs(hash);
        }
        case "boolean":
            return (o ? 1 : 0);
        case "number":
            return Math.abs(o) | 0;
        case "string": {
            let hash = 0;
            for (let i = 0, len = o.length; i < len; i++) {
                hash = (((hash << 5) - hash) + o.charCodeAt(i)) | 0;
            }
            return Math.abs(hash);
        }
        default:
            return 0;
    }
}
exports.hash_of = hash_of;
function compare_recursive(o1, o2) {
    if (typeof o1 !== typeof o2) {
        return false;
    }
    if (typeof o1 === "object") {
        if (Array.isArray(o1)) {
            if (o1.length !== o2.length) {
                return false;
            }
            for (let i = 0; i < o1.length; ++i) {
                if (!compare_recursive(o1[i], o2[i])) {
                    return false;
                }
            }
            return true;
        }
        else if (o1 instanceof Object) {
            for (const prop in o1) {
                if (o1.hasOwnProperty(prop)) {
                    if (!o2.hasOwnProperty(prop)) {
                        return false;
                    }
                    if (!compare_recursive(o1[prop], o2[prop])) {
                        return false;
                    }
                }
            }
            for (const prop in o2) {
                if (o2.hasOwnProperty(prop)) {
                    if (!o1.hasOwnProperty(prop)) {
                        return false;
                    }
                }
            }
            return true;
        }
    }
    return o1 === o2;
}
exports.compare_recursive = compare_recursive;
//# sourceMappingURL=lib.js.map