# Imagen base oficial de Ubuntu
FROM ubuntu:22.04

# Evitar prompts interactivos y zonas horarias
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    tar \
    git \
    python3 \
    python3-pip \
    nodejs \
    npm \
    sudo \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Descargar e instalar code-server
RUN wget https://github.com/coder/code-server/releases/download/v4.16.1/code-server-4.16.1-linux-amd64.tar.gz && \
    tar -xzf code-server-4.16.1-linux-amd64.tar.gz && \
    mv code-server-4.16.1-linux-amd64 /usr/local/code-server && \
    rm code-server-4.16.1-linux-amd64.tar.gz && \
    ln -s /usr/local/code-server/bin/code-server /usr/local/bin/code-server

# Crear usuario no root
RUN useradd -m -s /bin/bash coder && \
    chown -R coder:coder /home/coder

# Cambiar al usuario coder
USER coder
WORKDIR /home/coder

# Crear directorios necesarios
RUN mkdir -p /home/coder/.config/code-server && \
    mkdir -p /home/coder/.local/share/code-server

# Crear product.json para marketplace de extensiones (SOLUCIÓN ERROR 403)
RUN cat > /home/coder/.local/share/code-server/product.json << 'EOF'
{
    "extensionsGallery": {
        "serviceUrl": "https://open-vsx.org/vscode/gallery",
        "itemUrl": "https://open-vsx.org/vscode/item",
        "resourceUrlTemplate": "https://open-vsx.org/vscode/asset/{path}"
    }
}
EOF

# Exponer puerto
EXPOSE 8080

# Comando de inicio simplificado - LA CONTRASEÑA SE PASA POR VARIABLE DE ENTORNO
CMD ["/usr/local/code-server/bin/code-server", \
     "--bind-addr", "0.0.0.0:8080", \
     "--auth", "password", \
     "--disable-telemetry", \
     "--user-data-dir", "/home/coder/.local/share/code-server", \
     "--extensions-dir", "/home/coder/.local/share/code-server/extensions"]