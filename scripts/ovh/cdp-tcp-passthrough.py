#!/usr/bin/env python3
import re
import select
import socket
import sys
import threading

listen_host = sys.argv[1]
listen_port = int(sys.argv[2])
target_host = sys.argv[3]
target_port = int(sys.argv[4])

def recv_headers(sock, limit=131072):
    data = b""
    while b"\r\n\r\n" not in data and len(data) < limit:
        chunk = sock.recv(8192)
        if not chunk:
            break
        data += chunk
    return data

def relay(client):
    upstream = None
    try:
        request = recv_headers(client)
        if not request:
            return
        request = re.sub(
            br"(?im)^Host:[ \t]*[^\r\n]+",
            f"Host: {target_host}:{target_port}".encode(),
            request,
            count=1,
        )

        upstream = socket.create_connection((target_host, target_port), timeout=10)
        upstream.sendall(request)

        sockets = [client, upstream]
        while True:
            readable, _, _ = select.select(sockets, [], [], 60)
            if not readable:
                continue
            for source in readable:
                data = source.recv(65536)
                if not data:
                    return
                destination = upstream if source is client else client
                destination.sendall(data)
    except Exception:
        pass
    finally:
        for sock in (client, upstream):
            if sock is not None:
                try:
                    sock.close()
                except Exception:
                    pass

server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind((listen_host, listen_port))
server.listen(64)

while True:
    client, _ = server.accept()
    threading.Thread(target=relay, args=(client,), daemon=True).start()
