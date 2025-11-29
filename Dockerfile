FROM python:3.9-slim

# Instalar FFmpeg y dependencias necesarias
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de requisitos
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación
COPY bot.py .

# Comando para ejecutar la aplicación
CMD ["python", "bot.py"]