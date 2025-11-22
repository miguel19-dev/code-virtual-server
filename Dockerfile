# Imagen base oficial de Ubuntu
FROM ubuntu:22.04

# Evitar prompts interactivos
ENV DEBIAN_FRONTEND=noninteractive

# Instalar dependencias
RUN apt-get update && apt-get install -y \
    curl wget tar nodejs npm git \
    && rm -rf /var/lib/apt/lists/*

# Descargar code-server
RUN wget https://github.com/coder/code-server/releases/download/v4.16.1/code-server-4.16.1-linux-amd64.tar.gz \
    && tar -xvf code-server-4.16.1-linux-amd64.tar.gz \
    && mv code-server-4.16.1-linux-amd64 /usr/local/code-server

# Crear usuario no root
RUN useradd -m coder
USER coder
WORKDIR /home/coder

# Configuración de code-server
ENV PASSWORD=mO*061119
EXPOSE 8080

CMD ["/usr/local/code-server/bin/code-server", "--bind-addr", "0.0.0.0:8080", "--auth", "password"]