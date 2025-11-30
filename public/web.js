// Variables globales MEJORADAS
const socket = io();
let currentUser = null;
let selectedUser = null;
let selectedGroup = null;
let onlineUsers = [];
let allUsers = [];
let allGroups = [];
let activeChats = [];
let unreadCounts = {};
let newAvatarFile = null;
let newGroupAvatarFile = null;
let typingTimeouts = {};
let groupTypingTimeouts = {};
let userLastSeen = {};
let followers = [];
let following = [];
let currentProfileUser = null;
let currentProfileGroup = null;
let previousTab = 'chats';
let typingUsers = new Set();
let groupTypingUsers = new Map();
let selectedMembers = new Set();
let sentMessageIds = new Set();

// NUEVAS VARIABLES PARA MEJORAS
const avatarCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos
let replyingTo = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimeout = null;

// Inicializar la aplicación MEJORADA
document.addEventListener('DOMContentLoaded', async function() {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));

    if (!currentUser) {
        window.location.href = '/';
        return;
    }

    if (!currentUser.bio) currentUser.bio = "¡Yo uso SecureChat!";
    if (!currentUser.avatar) currentUser.avatar = '/default-avatar.png';

    updateCurrentUserDisplay();
    showSkeletons();
    setupEventListeners();

    socket.emit('user_online', currentUser);
    await loadInitialData();
    socket.emit('get_unread_counts', currentUser.id);
    loadFollowData();
    showTab('chats');
    
    // Inicializar botones dinámicos
    toggleSendVoiceButton();
});

// Configurar event listeners MEJORADO
function setupEventListeners() {
    // Event listeners existentes...
    document.getElementById('menu-btn').addEventListener('click', () => togglePanel(true));
    document.getElementById('panel-overlay').addEventListener('click', () => togglePanel(false));
    document.getElementById('my-profile-btn').addEventListener('click', showMyProfile);
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Navegación principal
    document.getElementById('fab-button').addEventListener('click', () => showTab('users'));
    document.getElementById('chat-back-btn').addEventListener('click', handleChatBack);
    document.getElementById('users-back-btn').addEventListener('click', () => showTab('chats'));

    // NUEVOS EVENT LISTENERS PARA MEJORAS
    setupMessageInputListeners();
    setupVoiceRecording();
    
    // Grupos - Botones principales
    document.getElementById('new-group-btn').addEventListener('click', showCreateGroupScreen);

    // Perfiles
    document.getElementById('current-chat-avatar').addEventListener('click', openCurrentProfile);
    document.getElementById('current-chat-name').addEventListener('click', openCurrentProfile);
    document.getElementById('my-profile-back-btn').addEventListener('click', hideMyProfile);
    document.getElementById('user-profile-back-btn').addEventListener('click', hideUserProfile);
    document.getElementById('group-profile-back-btn').addEventListener('click', hideGroupProfile);
    document.getElementById('edit-profile-btn').addEventListener('click', showEditProfile);
    document.getElementById('edit-profile-back-btn').addEventListener('click', hideEditProfile);
    document.getElementById('cancel-edit-btn').addEventListener('click', hideEditProfile);

    // Grupos - Edición
    document.getElementById('edit-group-btn').addEventListener('click', showEditGroupScreen);
    document.getElementById('edit-group-back-btn').addEventListener('click', hideEditGroupScreen);
    document.getElementById('cancel-edit-group-btn').addEventListener('click', hideEditGroupScreen);
    document.getElementById('save-group-btn').addEventListener('click', saveGroupChanges);

    // Grupos - Creación
    document.getElementById('create-group-back-btn').addEventListener('click', hideCreateGroupScreen);
    document.getElementById('cancel-create-group-btn').addEventListener('click', hideCreateGroupScreen);
    document.getElementById('add-members-btn').addEventListener('click', showSelectMembersScreen);
    document.getElementById('create-group-submit-btn').addEventListener('click', createGroup);

    // Grupos - Selección de miembros
    document.getElementById('select-members-back-btn').addEventListener('click', hideSelectMembersScreen);
    document.getElementById('confirm-members-btn').addEventListener('click', confirmMembersSelection);

    // Grupos - Unirse
    document.getElementById('confirm-join-group-btn').addEventListener('click', joinGroup);
    document.getElementById('cancel-join-group-btn').addEventListener('click', hideJoinGroupModal);
    document.getElementById('join-group-close-btn').addEventListener('click', hideJoinGroupModal);

    // Grupos - Salir
    document.getElementById('leave-group-btn').addEventListener('click', leaveGroup);

    // Seguidores/seguidos
    document.getElementById('followers-stat').addEventListener('click', showFollowers);
    document.getElementById('following-stat').addEventListener('click', showFollowing);
    document.getElementById('followers-back-btn').addEventListener('click', hideFollowers);
    document.getElementById('following-back-btn').addEventListener('click', hideFollowing);

    // Seguir/dejar de seguir
    document.getElementById('follow-btn').addEventListener('click', toggleFollow);
    document.getElementById('user-followers-stat').addEventListener('click', showUserFollowers);
    document.getElementById('user-following-stat').addEventListener('click', showUserFollowing);

    // Editar perfil
    document.getElementById('save-profile-btn').addEventListener('click', saveMyProfile);
    document.getElementById('delete-account-btn').addEventListener('click', deleteAccount);
    document.getElementById('avatar-input').addEventListener('change', previewAvatar);

    // Grupos - Avatares
    document.getElementById('group-avatar-input').addEventListener('change', previewGroupAvatar);
    document.getElementById('create-group-avatar').addEventListener('change', previewCreateGroupAvatar);

    // Socket events MEJORADOS
    setupSocketListeners();
}

// NUEVO: Configurar listeners del input de mensajes
function setupMessageInputListeners() {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const attachButton = document.getElementById('attach-button');
    const voiceButton = document.getElementById('voice-button');
    const cancelReplyButton = document.getElementById('cancel-reply');

    if (!messageInput) return;

    // Input de texto
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        
        // Alternar entre micrófono y enviar
        toggleSendVoiceButton();
        
        // Manejar estados de escritura
        handleTyping();
    });

    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Botón de adjuntar
    if (attachButton) {
        attachButton.addEventListener('click', showMediaPicker);
    }

    // Botón de cancelar respuesta
    if (cancelReplyButton) {
        cancelReplyButton.addEventListener('click', cancelReply);
    }

    // Swipe para respuesta
    setupSwipeGestures();
}

// NUEVO: Configurar grabación de voz
function setupVoiceRecording() {
    const voiceButton = document.getElementById('voice-button');
    if (!voiceButton) return;

    let startX = 0;
    let isSwiping = false;

    voiceButton.addEventListener('touchstart', function(e) {
        e.preventDefault();
        startRecording(e);
    });
    
    voiceButton.addEventListener('mousedown', function(e) {
        e.preventDefault();
        startRecording(e);
    });

    voiceButton.addEventListener('touchend', stopRecording);
    voiceButton.addEventListener('mouseup', stopRecording);
    voiceButton.addEventListener('mouseleave', stopRecording);

    // Swipe para cancelar
    document.addEventListener('touchmove', function(e) {
        if (!isRecording) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        
        if (deltaX < -50) { // Swipe izquierda
            isSwiping = true;
            showCancelRecordingUI();
        } else {
            hideCancelRecordingUI();
        }
    });
}

// NUEVO: Configurar listeners de socket
function setupSocketListeners() {
    socket.on('users_online', (users) => {
        onlineUsers = users;
        updateUserStatuses();
    });

    socket.on('all_users', (users) => {
        allUsers = users;
        loadUsers();
    });

    socket.on('all_groups', (groups) => {
        allGroups = groups;
        loadUsers();
    });

    socket.on('user_updated', (updatedUser) => {
        const userIndex = allUsers.findIndex(u => u.id === updatedUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex] = updatedUser;
        }

        if (updatedUser.id === currentUser.id) {
            currentUser = updatedUser;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateCurrentUserDisplay();
            updateMyProfileDisplay();
        }

        if (selectedUser && selectedUser.id === updatedUser.id) {
            selectedUser = updatedUser;
            document.getElementById('current-chat-name').textContent = updatedUser.name;
            updateAvatarDisplay('current-chat-avatar', updatedUser.avatar, updatedUser.name);
        }

        loadUsers();
        loadActiveChats();
    });

    socket.on('new_group_created', (group) => {
        allGroups.push(group);
        loadUsers();
        loadActiveChats();
    });

    socket.on('group_updated', (group) => {
        const groupIndex = allGroups.findIndex(g => g.id === group.id);
        if (groupIndex !== -1) {
            allGroups[groupIndex] = group;
        }

        if (currentProfileGroup && currentProfileGroup.id === group.id) {
            currentProfileGroup = group;
            updateGroupProfileDisplay();
        }

        if (selectedGroup && selectedGroup.id === group.id) {
            selectedGroup = group;
            document.getElementById('current-chat-name').textContent = group.name;
            updateGroupAvatarDisplay('current-chat-avatar', group.avatar, group.name);
        }

        loadUsers();
        loadActiveChats();
    });

    socket.on('user_joined_group', (data) => {
        if (selectedGroup && selectedGroup.id === data.groupId) {
            addSystemMessage(`${data.user.name} se unió al grupo`);
        }
    });

    socket.on('user_left_group', (data) => {
        if (selectedGroup && selectedGroup.id === data.groupId) {
            addSystemMessage(`${data.user.name} salió del grupo`);
        }
    });

    // MEJORADO: Prevenir mensajes de otros chats
    socket.on('new_message', (messageData) => {
        if ((selectedUser && selectedUser.id === messageData.from) || 
            (!selectedUser && !selectedGroup)) {
            handleNewMessage(messageData);
        } else {
            // Solo incrementar contador, no mostrar mensaje
            unreadCounts[messageData.from] = (unreadCounts[messageData.from] || 0) + 1;
            loadActiveChats();
        }
    });

    socket.on('new_group_message', (messageData) => {
        if (selectedGroup && selectedGroup.id === messageData.groupId) {
            handleNewGroupMessage(messageData);
        } else {
            // Solo incrementar contador, no mostrar mensaje
            unreadCounts[messageData.groupId] = (unreadCounts[messageData.groupId] || 0) + 1;
            loadActiveChats();
        }
    });

    socket.on('unread_counts', (counts) => {
        unreadCounts = { ...unreadCounts, ...counts };
        updateUnreadBadges();
        loadActiveChats();
    });

    socket.on('unread_count_update', (data) => {
        unreadCounts[data.userId] = data.count;
        updateUnreadBadge(data.userId, data.count);
        loadActiveChats();
    });

    socket.on('user_offline', (userData) => {
        userLastSeen[userData.id] = userData.lastSeen || new Date().toISOString();
        if (selectedUser && selectedUser.id === userData.id) {
            updateUserOnlineStatus(selectedUser);
        }
        updateUserStatuses();
    });

    socket.on('user_typing', (data) => {
        if (data.from !== currentUser.id && selectedUser && selectedUser.id === data.from) {
            showTypingIndicator(data.from);
            typingUsers.add(data.from);
            updateChatsTypingStatus();
        }
    });

    socket.on('user_stop_typing', (data) => {
        if (data.from !== currentUser.id && selectedUser && selectedUser.id === data.from) {
            hideTypingIndicator(data.from);
            typingUsers.delete(data.from);
            updateChatsTypingStatus();
        }
    });

    socket.on('group_typing', (data) => {
        if (data.from !== currentUser.id && selectedGroup && selectedGroup.id === data.groupId) {
            showGroupTypingIndicator(data.from);
        }
    });

    socket.on('group_stop_typing', (data) => {
        if (data.from !== currentUser.id && selectedGroup && selectedGroup.id === data.groupId) {
            hideGroupTypingIndicator(data.from);
        }
    });

    socket.on('follow_data', (data) => {
        followers = data.followers;
        following = data.following;
        updateFollowCounts();
    });

    socket.on('follow_updated', (data) => {
        const userIndex = following.findIndex(u => u.id === data.followingId);
        if (data.isFollowing && userIndex === -1) {
            const user = allUsers.find(u => u.id === data.followingId);
            if (user) following.push(user);
        } else if (!data.isFollowing && userIndex !== -1) {
            following.splice(userIndex, 1);
        }
        updateFollowCounts();
    });

    socket.on('follower_updated', (data) => {
        loadFollowData();
    });

    socket.on('chats_updated', () => {
        loadActiveChats();
    });

    socket.on('message_sent', (messageData) => {
        if (messageData.id && messageData.id.startsWith('temp-')) {
            const tempMessage = document.querySelector(`[data-message-id="${messageData.id}"]`);
            if (tempMessage) {
                tempMessage.remove();
            }
        }
    });

    socket.on('group_message_sent', (messageData) => {
        if (messageData.id && messageData.id.startsWith('temp-group-')) {
            const tempMessage = document.querySelector(`[data-message-id="${messageData.id}"]`);
            if (tempMessage) {
                tempMessage.remove();
            }
        }
    });
}

// MEJORADO: Sistema de cache para avatares
function updateAvatarDisplay(elementId, avatarUrl, userName) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const now = Date.now();
    const cacheKey = `${elementId}-${avatarUrl}`;
    
    // Verificar cache
    if (avatarCache.has(cacheKey)) {
        const cached = avatarCache.get(cacheKey);
        if (now - cached.timestamp < CACHE_DURATION) {
            element.innerHTML = cached.html;
            return;
        }
    }
    
    let avatarHTML = '';
    
    if (avatarUrl && avatarUrl !== '/default-avatar.png' && avatarUrl !== '/default-group-avatar.png') {
        const dailyTimestamp = new Date().toDateString();
        const cacheSafeUrl = `${avatarUrl}?v=${dailyTimestamp}`;
        
        avatarHTML = `
            <img src="${cacheSafeUrl}" alt="${userName}" 
                 onerror="handleAvatarError(this, '${userName}')"
                 loading="lazy">
        `;
    } else {
        avatarHTML = `<div class="avatar-fallback">${userName.charAt(0).toUpperCase()}</div>`;
    }
    
    element.innerHTML = avatarHTML;
    
    // Guardar en cache
    avatarCache.set(cacheKey, {
        html: avatarHTML,
        timestamp: now
    });
}

function updateGroupAvatarDisplay(elementId, avatarUrl, groupName) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const now = Date.now();
    const cacheKey = `${elementId}-${avatarUrl}`;
    
    if (avatarCache.has(cacheKey)) {
        const cached = avatarCache.get(cacheKey);
        if (now - cached.timestamp < CACHE_DURATION) {
            element.innerHTML = cached.html;
            return;
        }
    }
    
    let avatarHTML = '';
    
    if (avatarUrl && avatarUrl !== '/default-group-avatar.png') {
        const dailyTimestamp = new Date().toDateString();
        const cacheSafeUrl = `${avatarUrl}?v=${dailyTimestamp}`;
        
        avatarHTML = `
            <img src="${cacheSafeUrl}" alt="${groupName}" 
                 onerror="handleAvatarError(this, '${groupName}')"
                 loading="lazy">
        `;
    } else {
        avatarHTML = `<div class="avatar-fallback">${groupName.charAt(0).toUpperCase()}</div>`;
    }
    
    element.innerHTML = avatarHTML;
    
    avatarCache.set(cacheKey, {
        html: avatarHTML,
        timestamp: now
    });
}

function handleAvatarError(imgElement, name) {
    imgElement.style.display = 'none';
    const parent = imgElement.parentElement;
    const existingFallback = parent.querySelector('.avatar-fallback');
    
    if (!existingFallback) {
        const fallback = document.createElement('div');
        fallback.className = 'avatar-fallback';
        fallback.textContent = name.charAt(0).toUpperCase();
        fallback.style.display = 'flex';
        parent.appendChild(fallback);
    } else {
        existingFallback.style.display = 'flex';
    }
}

// NUEVO: Sistema de respuesta a mensajes
function setupSwipeGestures() {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;

    let startX = 0;
    let currentMessage = null;

    messagesContainer.addEventListener('touchstart', (e) => {
        const messageElement = e.target.closest('.message');
        if (messageElement && !messageElement.classList.contains('system-message')) {
            currentMessage = messageElement;
            startX = e.touches[0].clientX;
        }
    });

    messagesContainer.addEventListener('touchmove', (e) => {
        if (!currentMessage) return;
        
        const currentX = e.touches[0].clientX;
        const deltaX = currentX - startX;
        
        if (deltaX > 50) { // Swipe derecha
            currentMessage.style.transform = `translateX(${Math.min(deltaX, 100)}px)`;
            currentMessage.style.transition = 'transform 0.2s ease';
        }
    });

    messagesContainer.addEventListener('touchend', (e) => {
        if (!currentMessage) return;
        
        const endX = e.changedTouches[0].clientX;
        const deltaX = endX - startX;
        
        if (deltaX > 100) { // Swipe suficiente para respuesta
            showReplyUI(currentMessage);
        }
        
        // Reset transform
        currentMessage.style.transform = '';
        currentMessage.style.transition = 'transform 0.3s ease';
        currentMessage = null;
    });
}

function showReplyUI(messageElement) {
    const messageId = messageElement.dataset.messageId;
    const messageContent = messageElement.querySelector('.message-content')?.textContent || '';
    const isOwnMessage = messageElement.classList.contains('sent');
    
    replyingTo = {
        id: messageId,
        content: messageContent,
        isOwn: isOwnMessage
    };
    
    // Mostrar UI de respuesta
    const replyUI = document.getElementById('reply-preview');
    const replyContent = document.getElementById('reply-content');
    
    if (replyUI && replyContent) {
        replyContent.textContent = messageContent.length > 50 ? 
            messageContent.substring(0, 50) + '...' : messageContent;
        
        replyUI.classList.add('active');
        
        // Scroll to bottom
        scrollToBottom();
    }
}

function cancelReply() {
    replyingTo = null;
    const replyUI = document.getElementById('reply-preview');
    if (replyUI) {
        replyUI.classList.remove('active');
    }
}

// NUEVO: Grabación de voz
async function startRecording(e) {
    e.preventDefault();
    
    if (isRecording) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = sendAudioMessage;
        
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        
        // UI de grabación
        showRecordingUI();
        
        // Actualizar timer
        updateRecordingTimer();
        
        // Timeout automático (60 segundos)
        recordingTimeout = setTimeout(() => {
            stopRecording();
        }, 60000);
        
    } catch (error) {
        console.error('Error al acceder al micrófono:', error);
        showNotification('No se pudo acceder al micrófono. Permite el acceso e intenta nuevamente.', 'error');
    }
}

function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    
    clearTimeout(recordingTimeout);
    
    if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    // Detener stream
    if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    isRecording = false;
    hideRecordingUI();
}

function showRecordingUI() {
    const voiceButton = document.getElementById('voice-button');
    const recordingUI = document.getElementById('recording-ui');
    
    if (voiceButton) voiceButton.classList.add('recording');
    if (recordingUI) recordingUI.classList.add('active');
}

function hideRecordingUI() {
    const voiceButton = document.getElementById('voice-button');
    const recordingUI = document.getElementById('recording-ui');
    
    if (voiceButton) voiceButton.classList.remove('recording');
    if (recordingUI) recordingUI.classList.remove('active');
}

function showCancelRecordingUI() {
    const recordingUI = document.getElementById('recording-ui');
    if (recordingUI) {
        recordingUI.classList.add('cancelling');
    }
}

function hideCancelRecordingUI() {
    const recordingUI = document.getElementById('recording-ui');
    if (recordingUI) {
        recordingUI.classList.remove('cancelling');
    }
}

function updateRecordingTimer() {
    if (!isRecording) return;
    
    const timerElement = document.getElementById('recording-timer');
    if (timerElement) {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    setTimeout(updateRecordingTimer, 1000);
}

function sendAudioMessage() {
    if (audioChunks.length === 0) return;
    
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(audioBlob);
    const duration = Math.round((Date.now() - recordingStartTime) / 1000);
    
    // Por ahora mostramos un mensaje de demo
    // En una implementación real, enviarías el blob al servidor
    showNotification('Mensaje de voz grabado (' + duration + 's). En una implementación real se enviaría al servidor.', 'info');
    
    // Limpiar
    audioChunks = [];
    recordingStartTime = null;
}

// NUEVO: Alternar entre micrófono y enviar
function toggleSendVoiceButton() {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const voiceButton = document.getElementById('voice-button');
    
    if (!messageInput || !sendButton || !voiceButton) return;
    
    const hasText = messageInput.value.trim().length > 0;
    
    if (hasText) {
        sendButton.style.display = 'flex';
        voiceButton.style.display = 'none';
    } else {
        sendButton.style.display = 'none';
        voiceButton.style.display = 'flex';
    }
}

// NUEVO: Selector de medios
function showMediaPicker() {
    // Crear input de archivo dinámicamente
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/*';
    fileInput.multiple = true;
    
    fileInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            if (file.type.startsWith('image/')) {
                previewAndSendImage(file);
            } else if (file.type.startsWith('video/')) {
                previewAndSendVideo(file);
            }
        });
    };
    
    fileInput.click();
}

function previewAndSendImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        // En una implementación real, enviarías el archivo al servidor
        showNotification('Imagen seleccionada: ' + file.name, 'info');
        // sendMediaMessage(file, 'image');
    };
    reader.readAsDataURL(file);
}

function previewAndSendVideo(file) {
    // En una implementación real, enviarías el archivo al servidor
    showNotification('Video seleccionado: ' + file.name, 'info');
    // sendMediaMessage(file, 'video');
}

// MEJORADO: Enviar mensaje con sistema de respuesta
async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();

    if (!message && !replyingTo) {
        return;
    }

    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    const messageData = {
        id: tempId,
        message: message,
        timestamp: new Date().toISOString()
    };

    // Agregar datos de respuesta si existe
    if (replyingTo) {
        messageData.replyTo = {
            id: replyingTo.id,
            content: replyingTo.content,
            isOwn: replyingTo.isOwn
        };
    }

    if (selectedUser) {
        messageData.from = currentUser.id;
        messageData.to = selectedUser.id;
        
        addMessageToUI(messageData);
        messageInput.value = '';
        resetMessageInput();
        
        socket.emit('private_message', {
            to: selectedUser,
            message: message,
            from: currentUser,
            replyTo: messageData.replyTo
        });

    } else if (selectedGroup) {
        messageData.type = 'group';
        messageData.from = currentUser.id;
        messageData.groupId = selectedGroup.id;
        
        addGroupMessageToUI(messageData);
        messageInput.value = '';
        resetMessageInput();
        
        socket.emit('group_message', {
            groupId: selectedGroup.id,
            message: message,
            from: currentUser,
            replyTo: messageData.replyTo
        });
    }

    // Limpiar respuesta
    cancelReply();
}

function resetMessageInput() {
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.style.height = 'auto';
        toggleSendVoiceButton();
    }
}

// MEJORADO: Agregar mensaje a UI con sistema de respuesta
function addMessageToUI(messageData) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;
    
    const emptyState = messagesContainer.querySelector('.empty-state');
    
    if (emptyState) {
        emptyState.remove();
    }

    const existingMessage = document.querySelector(`[data-message-id="${messageData.id}"]`);
    if (existingMessage) return;

    const messageDiv = document.createElement('div');
    const isSent = messageData.from === currentUser.id;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.dataset.messageId = messageData.id;

    const time = new Date(messageData.timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });

    let replyHTML = '';
    if (messageData.replyTo) {
        replyHTML = `
            <div class="message-reply">
                <div class="reply-indicator"></div>
                <div class="reply-content">
                    <div class="reply-author">${messageData.replyTo.isOwn ? 'Tú' : 'Usuario'}</div>
                    <div class="reply-text">${messageData.replyTo.content}</div>
                </div>
            </div>
        `;
    }

    let contentHTML = '';
    if (messageData.type === 'audio') {
        contentHTML = `
            <div class="audio-message">
                <button class="play-audio-btn" onclick="playAudio('${messageData.audioUrl}')">
                    <i class="fas fa-play"></i>
                </button>
                <div class="audio-waveform"></div>
                <div class="audio-duration">${messageData.duration}s</div>
            </div>
        `;
    } else {
        contentHTML = `<div class="message-content">${messageData.message}</div>`;
    }

    messageDiv.innerHTML = `
        ${replyHTML}
        ${contentHTML}
        <div class="message-time">${time}</div>
    `;

    messagesContainer.appendChild(messageDiv);

    // Animación de entrada
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        messageDiv.style.transition = 'all 0.3s ease';
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateY(0)';
    }, 10);

    scrollToBottom();
}

// MEJORADO: Agregar mensaje grupal a UI
function addGroupMessageToUI(messageData) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;

    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const existingMessage = document.querySelector(`[data-message-id="${messageData.id}"]`);
    if (existingMessage) return;

    const messageDiv = document.createElement('div');

    const isSent = messageData.from === currentUser.id;
    const sender = allUsers.find(u => u.id === messageData.from);
    const senderName = sender ? sender.name : 'Usuario';

    messageDiv.className = `message group-message ${isSent ? 'sent' : 'received'}`;
    messageDiv.dataset.messageId = messageData.id;

    const time = new Date(messageData.timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });

    let replyHTML = '';
    if (messageData.replyTo) {
        replyHTML = `
            <div class="message-reply">
                <div class="reply-indicator"></div>
                <div class="reply-content">
                    <div class="reply-author">${messageData.replyTo.isOwn ? 'Tú' : 'Usuario'}</div>
                    <div class="reply-text">${messageData.replyTo.content}</div>
                </div>
            </div>
        `;
    }

    messageDiv.innerHTML = `
        ${!isSent ? `<div class="message-sender">${senderName}</div>` : ''}
        ${replyHTML}
        <div class="message-content">${messageData.message}</div>
        <div class="message-time">${time}</div>
    `;

    messagesContainer.appendChild(messageDiv);

    // Animación de entrada
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        messageDiv.style.transition = 'all 0.3s ease';
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateY(0)';
    }, 10);

    scrollToBottom();
}

// MEJORADO: Gestión de grupos
async function createGroup() {
    const name = document.getElementById('create-group-name').value.trim();
    const description = document.getElementById('create-group-description').value.trim();
    
    if (!name) {
        showNotification('El nombre del grupo es obligatorio', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('create-group-submit-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    submitBtn.disabled = true;
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('creatorId', currentUser.id);
    formData.append('creatorName', currentUser.name);
    formData.append('members', JSON.stringify(Array.from(selectedMembers)));
    
    if (newGroupAvatarFile) {
        formData.append('avatar', newGroupAvatarFile);
    }
    
    try {
        const response = await fetch('/api/groups', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification('¡Grupo creado exitosamente!', 'success');
            
            submitBtn.innerHTML = '<i class="fas fa-check"></i> ¡Creado!';
            setTimeout(() => {
                hideCreateGroupScreen();
                selectedMembers.clear();
                openGroupChat(data.group.id);
            }, 1000);
            
        } else {
            const error = await response.json();
            showNotification('Error: ' + error.error, 'error');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error creando grupo:', error);
        showNotification('Error al crear el grupo', 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// NUEVO: Sistema de notificaciones
function showNotification(message, type = 'info') {
    // Crear notificación toast
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Estilos básicos para la notificación
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${getNotificationColor(type)};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 300px;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remover después de 3 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

function getNotificationColor(type) {
    const colors = {
        'success': '#10b981',
        'error': '#ef4444',
        'warning': '#f59e0b',
        'info': '#3b82f6'
    };
    return colors[type] || '#3b82f6';
}

// MEJORADO: Scroll to bottom optimizado
function scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    if (messagesContainer) {
        requestAnimationFrame(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
    }
}

// MEJORADO: Cargar datos iniciales optimizado
async function loadInitialData() {
    try {
        await Promise.all([
            loadUsers(),
            loadActiveChats()
        ]);
        socket.emit('get_all_groups');
    } catch (error) {
        console.error('Error cargando datos iniciales:', error);
    } finally {
        hideSkeletons();
    }
}

// FUNCIONES EXISTENTES MANTENIDAS CON MEJORAS

function togglePanel(show) {
    const panel = document.getElementById('side-panel');
    const overlay = document.getElementById('panel-overlay');
    
    if (show === undefined) {
        panel.classList.toggle('active');
        overlay.classList.toggle('active');
    } else {
        if (show) {
            panel.classList.add('active');
            overlay.classList.add('active');
        } else {
            panel.classList.remove('active');
            overlay.classList.remove('active');
        }
    }
}

function showSkeletons() {
    const chatsSkeleton = document.getElementById('chats-skeleton');
    if (chatsSkeleton) {
        chatsSkeleton.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const skeletonItem = document.createElement('div');
            skeletonItem.className = 'chat-item';
            skeletonItem.innerHTML = `
                <div class="skeleton skeleton-avatar"></div>
                <div class="chat-info">
                    <div class="skeleton skeleton-text short"></div>
                    <div class="skeleton skeleton-text medium"></div>
                </div>
            `;
            chatsSkeleton.appendChild(skeletonItem);
        }
    }

    const usersSkeleton = document.getElementById('users-skeleton');
    if (usersSkeleton) {
        usersSkeleton.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const skeletonItem = document.createElement('div');
            skeletonItem.className = 'user-item';
            skeletonItem.innerHTML = `
                <div class="skeleton skeleton-avatar"></div>
                <div class="user-info">
                    <div class="skeleton skeleton-text short"></div>
                    <div class="skeleton skeleton-text medium"></div>
                </div>
            `;
            usersSkeleton.appendChild(skeletonItem);
        }
    }
}

function hideSkeletons() {
    const chatsSkeleton = document.getElementById('chats-skeleton');
    const usersSkeleton = document.getElementById('users-skeleton');
    
    if (chatsSkeleton) chatsSkeleton.style.display = 'none';
    if (usersSkeleton) usersSkeleton.style.display = 'none';
}

function loadFollowData() {
    socket.emit('get_follow_data', currentUser.id);
}

function updateFollowCounts() {
    const followersCount = document.getElementById('followers-count');
    const followingCount = document.getElementById('following-count');
    
    if (followersCount) followersCount.textContent = followers.length;
    if (followingCount) followingCount.textContent = following.length;

    if (currentProfileUser) {
        const userFollowersCount = document.getElementById('user-followers-count');
        const userFollowingCount = document.getElementById('user-following-count');
        
        if (userFollowersCount) userFollowersCount.textContent = '0';
        if (userFollowingCount) userFollowingCount.textContent = '0';
    }
}

// MEJORADO: Cargar usuarios con cache inteligente
async function loadUsers() {
    try {
        const usersList = document.getElementById('users-list');
        const emptyState = document.getElementById('users-empty');

        if (!usersList || !emptyState) return;

        const otherUsers = allUsers.filter(user => user.id !== currentUser.id);
        const publicGroups = allGroups.filter(group => group.isPublic);

        const totalItems = otherUsers.length + publicGroups.length;

        if (totalItems === 0) {
            usersList.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            usersList.style.display = 'block';
            emptyState.style.display = 'none';

            usersList.innerHTML = '';

            // Mostrar grupos públicos primero
            publicGroups.forEach(group => {
                const isMember = group.members.includes(currentUser.id);
                const groupItem = document.createElement('div');
                groupItem.className = 'user-item';
                groupItem.dataset.groupId = group.id;

                groupItem.innerHTML = `
                    <div class="user-avatar group-avatar">
                        ${getCachedAvatarHTML(group.avatar, group.name, 'group')}
                    </div>
                    <div class="user-info">
                        <div class="user-name">${group.name}</div>
                        <div class="group-info">
                            <div class="group-members-count">${group.members.length} miembros</div>
                            ${!isMember ? '<div class="join-hint">Toca para unirte</div>' : ''}
                        </div>
                    </div>
                `;

                groupItem.addEventListener('click', (e) => {
                    groupItem.style.transform = 'scale(0.98)';
                    setTimeout(() => {
                        groupItem.style.transform = '';
                    }, 150);

                    if (!isMember) {
                        showJoinGroupModal(group);
                    } else {
                        openGroupChat(group.id);
                    }
                });

                usersList.appendChild(groupItem);
            });

            // Mostrar usuarios
            otherUsers.forEach(user => {
                if (!user.bio) user.bio = "¡Yo uso SecureChat!";
                if (!user.avatar) user.avatar = '/default-avatar.png';

                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                userItem.dataset.userId = user.id;

                const isOnline = onlineUsers.find(u => u.id === user.id);
                const statusText = isOnline ? 'En línea' : getLastSeenText(user.id);

                userItem.innerHTML = `
                    <div class="user-avatar">
                        ${getCachedAvatarHTML(user.avatar, user.name, 'user')}
                    </div>
                    <div class="user-info">
                        <div class="user-name">${user.name}</div>
                        <div class="user-status ${isOnline ? 'online' : 'offline'}">${statusText}</div>
                    </div>
                `;

                userItem.addEventListener('click', (e) => {
                    userItem.style.transform = 'scale(0.98)';
                    setTimeout(() => {
                        userItem.style.transform = '';
                    }, 150);
                    startChat(user.id);
                });

                const avatarElement = userItem.querySelector('.user-avatar');
                if (avatarElement) {
                    avatarElement.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showOtherUserProfile(user.id);
                    });
                }

                usersList.appendChild(userItem);
            });
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        hideSkeletons();
    }
}

// NUEVA: Función helper para avatares con cache
function getCachedAvatarHTML(avatarUrl, name, type = 'user') {
    const isDefault = type === 'user' ? 
        (!avatarUrl || avatarUrl === '/default-avatar.png') : 
        (!avatarUrl || avatarUrl === '/default-group-avatar.png');
    
    if (isDefault) {
        return `<div class="avatar-fallback">${name.charAt(0).toUpperCase()}</div>`;
    }
    
    const dailyTimestamp = new Date().toDateString();
    const cacheSafeUrl = `${avatarUrl}?v=${dailyTimestamp}`;
    
    return `
        <img src="${cacheSafeUrl}" alt="${name}" 
             onerror="this.style.display='none'; this.nextElementSibling?.style.display='flex' || this.parentElement.querySelector('.avatar-fallback')?.style.display='flex'"
             loading="lazy">
        <div class="avatar-fallback" style="display: none;">${name.charAt(0).toUpperCase()}</div>
    `;
}

// MEJORADO: Obtener texto de última vez conectado
function getLastSeenText(userId) {
    const lastSeen = userLastSeen[userId];
    if (lastSeen) {
        const lastSeenTime = new Date(lastSeen);
        const now = new Date();
        const diffMinutes = Math.floor((now - lastSeenTime) / (1000 * 60));

        if (diffMinutes < 1) return 'Ahora mismo';
        if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
        if (diffMinutes < 1440) return `Hace ${Math.floor(diffMinutes / 60)} h`;

        return `Últ. vez ${lastSeenTime.toLocaleDateString('es-ES')}`;
    }
    return 'Desconectado';
}

// MEJORADO: Actualizar estados de usuarios en tiempo real
function updateUserStatuses() {
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(item => {
        const userId = item.dataset.userId;
        if (userId) {
            const user = allUsers.find(u => u.id === userId);
            if (user) {
                const isOnline = onlineUsers.find(u => u.id === userId);
                const statusElement = item.querySelector('.user-status');
                const statusText = isOnline ? 'En línea' : getLastSeenText(userId);

                if (statusElement) {
                    statusElement.textContent = statusText;
                    statusElement.className = `user-status ${isOnline ? 'online' : 'offline'}`;
                }
            }
        }
    });

    if (selectedUser) {
        updateUserOnlineStatus(selectedUser);
    }
}

// MEJORADO: Cargar chats activos - INCLUYENDO GRUPOS
async function loadActiveChats() {
    try {
        const response = await fetch(`/api/chats?userId=${currentUser.id}`);
        const chatsData = await response.json();
        activeChats = chatsData;
        renderActiveChats();
    } catch (error) {
        console.error('Error cargando chats:', error);
        hideSkeletons();
    }
}

// MEJORADO: Renderizar chats activos en la UI
function renderActiveChats() {
    const chatsList = document.getElementById('chats-list');
    const emptyState = document.getElementById('chats-empty');

    if (!chatsList || !emptyState) return;

    if (activeChats.length === 0) {
        chatsList.style.display = 'none';
        emptyState.style.display = 'flex';
    } else {
        chatsList.style.display = 'block';
        emptyState.style.display = 'none';

        chatsList.innerHTML = '';
        activeChats.forEach(chat => {
            if (chat.type === 'private') {
                const unreadCount = unreadCounts[chat.user.id] || 0;
                const isTyping = typingUsers.has(chat.user.id);
                const lastMessage = isTyping ? 'escribiendo...' : (chat.lastMessage || 'Haz clic para chatear');
                
                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item';
                chatItem.dataset.userId = chat.user.id;
                chatItem.innerHTML = `
                    <div class="chat-avatar">
                        ${getCachedAvatarHTML(chat.user.avatar, chat.user.name, 'user')}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${chat.user.name}</div>
                        <div class="chat-last-message ${isTyping ? 'typing' : ''}">${lastMessage}</div>
                    </div>
                    <div class="chat-time">${isTyping ? '' : (chat.lastTime || '')}</div>
                    ${unreadCount > 0 ? `<div class="unread-badge" id="chat-unread-${chat.user.id}">${unreadCount}</div>` : ''}
                `;

                chatItem.addEventListener('click', () => openChat(chat.user.id));

                const avatarElement = chatItem.querySelector('.chat-avatar');
                if (avatarElement) {
                    avatarElement.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showOtherUserProfile(chat.user.id);
                    });
                }

                chatsList.appendChild(chatItem);
            } else if (chat.type === 'group') {
                const unreadCount = unreadCounts[chat.group.id] || 0;
                const lastMessage = chat.lastMessage || 'Grupo creado';
                
                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item';
                chatItem.dataset.groupId = chat.group.id;
                chatItem.innerHTML = `
                    <div class="chat-avatar group-avatar">
                        ${getCachedAvatarHTML(chat.group.avatar, chat.group.name, 'group')}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${chat.group.name}</div>
                        <div class="chat-last-message">${lastMessage}</div>
                    </div>
                    <div class="chat-time">${chat.lastTime || ''}</div>
                    ${unreadCount > 0 ? `<div class="unread-badge" id="chat-unread-${chat.group.id}">${unreadCount}</div>` : ''}
                `;

                chatItem.addEventListener('click', () => openGroupChat(chat.group.id));

               const avatarElement = chatItem.querySelector('.chat-avatar');
                if (avatarElement) {
                    avatarElement.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showGroupProfile(chat.group.id);
                    });
                }

                chatsList.appendChild(chatItem);
            }
        });
    }

    hideSkeletons();
}

// MEJORADO: Iniciar chat con un usuario
function startChat(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        console.error('Usuario no encontrado');
        return;
    }

    openChat(userId);
}

// MEJORADO: Abrir chat sin auto-focus
function openChat(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        console.error('Usuario no encontrado en openChat');
        return;
    }

    selectedUser = user;
    selectedGroup = null;

    // Limpiar estados de escritura grupal
    groupTypingUsers.clear();

    previousTab = document.getElementById('users-tab').classList.contains('active') ? 'users' : 'chats';

    showTab('chat');

    document.getElementById('current-chat-name').textContent = user.name;
    updateAvatarDisplay('current-chat-avatar', user.avatar, user.name);

    updateUserOnlineStatus(user);

    loadMessages(user);

    socket.emit('mark_as_read', {
        userId: currentUser.id,
        otherUserId: user.id
    });

    unreadCounts[user.id] = 0;
    updateUnreadBadge(user.id, 0);

    // Inicializar botones
    setTimeout(toggleSendVoiceButton, 100);
}

// MEJORADO: Abrir chat de grupo sin auto-focus
function openGroupChat(groupId) {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) {
        console.error('Grupo no encontrado en openGroupChat');
        return;
    }

    selectedGroup = group;
    selectedUser = null;

    // Limpiar estados de escritura
    typingUsers.clear();

    previousTab = document.getElementById('users-tab').classList.contains('active') ? 'users' : 'chats';

    showTab('chat');

    document.getElementById('current-chat-name').textContent = group.name;
    updateGroupAvatarDisplay('current-chat-avatar', group.avatar, group.name);

    document.getElementById('current-chat-status').textContent = `${group.members.length} miembros`;
    document.getElementById('current-chat-status').className = 'current-chat-status';

    loadGroupMessages(group);

    socket.emit('mark_group_as_read', {
        userId: currentUser.id,
        groupId: group.id
    });

    unreadCounts[group.id] = 0;
    updateUnreadBadge(group.id, 0);

    // Inicializar botones
    setTimeout(toggleSendVoiceButton, 100);
}

// NUEVO: Abrir perfil del chat actual
function openCurrentProfile() {
    if (selectedUser) {
        showOtherUserProfile(selectedUser.id);
    } else if (selectedGroup) {
        showGroupProfile(selectedGroup.id);
    }
}

// Manejar el botón de regresar en el chat
function handleChatBack() {
    showTab(previousTab);
    selectedUser = null;
    selectedGroup = null;
    
    // Limpiar estados de escritura
    typingUsers.clear();
    groupTypingUsers.clear();
    
    // Limpiar respuesta activa
    cancelReply();
}

// MEJORADO: Actualizar estado en línea del usuario en el chat
function updateUserOnlineStatus(user) {
    const isOnline = onlineUsers.find(u => u.id === user.id);
    const statusElement = document.getElementById('current-chat-status');

    if (!statusElement) return;

    if (isOnline) {
        statusElement.textContent = 'En línea';
        statusElement.className = 'current-chat-status';
    } else {
        const lastSeen = userLastSeen[user.id];
        if (lastSeen) {
            const lastSeenTime = new Date(lastSeen).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            statusElement.textContent = `Últ. vez ${lastSeenTime}`;
        } else {
            statusElement.textContent = 'Desconectado';
        }
        statusElement.className = 'current-chat-status offline';
    }
}

// MEJORADO: Cargar mensajes del chat privado
async function loadMessages(user) {
    try {
        const response = await fetch(`/api/messages/${currentUser.id}/${user.id}`);
        const messages = await response.json();

        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-state" style="justify-content: center; height: 100%; display: flex; flex-direction: column;">
                    <div class="empty-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div class="empty-title">Inicia la conversación</div>
                    <div class="empty-subtitle">Envía el primer mensaje a ${user.name}</div>
                </div>
            `;
        } else {
            messages.forEach(message => {
                addMessageToUI(message);
            });
        }

        scrollToBottom();
    } catch (error) {
        console.error('Error cargando mensajes:', error);
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="empty-state" style="justify-content: center; height: 100%; display: flex; flex-direction: column;">
                    <div class="empty-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="empty-title">Error cargando mensajes</div>
                    <div class="empty-subtitle">Intenta nuevamente</div>
                </div>
            `;
        }
    }
}

// MEJORADO: Cargar mensajes del grupo
async function loadGroupMessages(group) {
    try {
        const response = await fetch(`/api/group-messages/${group.id}`);
        const messages = await response.json();

        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-state" style="justify-content: center; height: 100%; display: flex; flex-direction: column;">
                    <div class="empty-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="empty-title">Bienvenido al grupo</div>
                    <div class="empty-subtitle">Sé el primero en enviar un mensaje</div>
                </div>
            `;
        } else {
            messages.forEach(message => {
                addGroupMessageToUI(message);
            });
        }

        scrollToBottom();
    } catch (error) {
        console.error('Error cargando mensajes grupales:', error);
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="empty-state" style="justify-content: center; height: 100%; display: flex; flex-direction: column;">
                    <div class="empty-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="empty-title">Error cargando mensajes</div>
                    <div class="empty-subtitle">Intenta nuevamente</div>
                </div>
            `;
        }
    }
}

// MEJORADO: Agregar mensaje del sistema (unirse/salir)
function addSystemMessage(text) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system-message';
    messageDiv.style.alignSelf = 'center';
    messageDiv.style.background = 'rgba(255, 255, 255, 0.1)';
    messageDiv.style.color = 'var(--text-secondary)';
    messageDiv.style.fontSize = '0.8em';
    messageDiv.style.padding = '8px 12px';
    messageDiv.style.margin = '8px 0';

    messageDiv.innerHTML = text;

    messagesContainer.appendChild(messageDiv);

    scrollToBottom();
}

// MEJORADO: Mostrar indicador de escribiendo
function showTypingIndicator(userId) {
    if (!selectedUser || selectedUser.id !== userId) return;

    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;

    const existingIndicator = document.getElementById('typing-indicator');

    if (!existingIndicator) {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <span style="font-size: 0.8em; margin-left: 8px;">escribiendo...</span>
        `;
        messagesContainer.appendChild(typingDiv);
        scrollToBottom();
    }

    const statusElement = document.getElementById('current-chat-status');
    if (statusElement) {
        statusElement.textContent = 'escribiendo...';
        statusElement.className = 'current-chat-status typing';
    }

    if (typingTimeouts[userId]) {
        clearTimeout(typingTimeouts[userId]);
    }

    typingTimeouts[userId] = setTimeout(() => {
        hideTypingIndicator(userId);
    }, 3000);
}

// MEJORADO: Ocultar indicador de escribiendo
function hideTypingIndicator(userId) {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }

    if (selectedUser && selectedUser.id === userId) {
        updateUserOnlineStatus(selectedUser);
    }
}

// NUEVO: Estados de escritura grupal
function showGroupTypingIndicator(userId) {
    if (!selectedGroup) return;

    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    // Agregar usuario a la lista de typing
    groupTypingUsers.set(userId, user.name);

    updateGroupTypingStatus();

    // Limpiar timeout anterior
    if (groupTypingTimeouts[userId]) {
        clearTimeout(groupTypingTimeouts[userId]);
    }

    // Timeout para remover automáticamente
    groupTypingTimeouts[userId] = setTimeout(() => {
        hideGroupTypingIndicator(userId);
    }, 3000);
}

function hideGroupTypingIndicator(userId) {
    groupTypingUsers.delete(userId);
    updateGroupTypingStatus();
}

function updateGroupTypingStatus() {
    const statusElement = document.getElementById('current-chat-status');
    if (!statusElement) return;

    const typingCount = groupTypingUsers.size;

    if (typingCount === 0) {
        // Restaurar estado normal
        if (selectedGroup) {
            statusElement.textContent = `${selectedGroup.members.length} miembros`;
            statusElement.className = 'current-chat-status';
        }
    } else {
        // Mostrar estados de escritura
        const typingNames = Array.from(groupTypingUsers.values());
        let statusText = '';

        if (typingCount === 1) {
            statusText = `${typingNames[0]} está escribiendo...`;
        } else if (typingCount === 2) {
            statusText = `${typingNames[0]} y ${typingNames[1]} están escribiendo...`;
        } else {
            statusText = `${typingCount} personas están escribiendo...`;
        }

        statusElement.textContent = statusText;
        statusElement.className = 'current-chat-status typing';
    }
}

// MEJORADO: Actualizar estado "escribiendo" en chats activos
function updateChatsTypingStatus() {
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(chatItem => {
        const userId = chatItem.dataset.userId;
        const lastMessageElement = chatItem.querySelector('.chat-last-message');
        
        if (userId && lastMessageElement && typingUsers.has(userId)) {
            lastMessageElement.textContent = 'escribiendo...';
            lastMessageElement.classList.add('typing');
        } else if (lastMessageElement) {
            const chat = activeChats.find(c => c.user && c.user.id === userId);
            if (chat) {
                lastMessageElement.textContent = chat.lastMessage || 'Haz clic para chatear';
                lastMessageElement.classList.remove('typing');
            }
        }
    });
}

// MEJORADO: Función para cambiar pestañas
function showTab(tabName) {
    // Ocultar todas las pestañas
    document.querySelectorAll('.tab-content, .users-tab-content, .profile-screen, .follow-screen, .edit-profile-screen, .edit-group-screen, .create-group-screen, .select-members-screen').forEach(element => {
        element.classList.remove('active');
    });

    // Mostrar la pestaña seleccionada
    if (tabName === 'users') {
        const usersTab = document.getElementById('users-tab');
        if (usersTab) usersTab.classList.add('active');
        previousTab = 'users';
    } else if (tabName === 'chat') {
        const chatTab = document.getElementById('chat-tab');
        if (chatTab) chatTab.classList.add('active');
    } else {
        const chatsTab = document.getElementById('chats-tab');
        if (chatsTab) chatsTab.classList.add('active');
        previousTab = 'chats';
    }

    togglePanel(false);

    // Controlar visibilidad del botón flotante
    const fabButton = document.getElementById('fab-button');
    if (fabButton) {
        if (tabName === 'chats') {
            fabButton.style.display = 'flex';
        } else {
            fabButton.style.display = 'none';
        }
    }
}

// NUEVO: Validación de formularios en tiempo real
function validateGroupForm() {
    const name = document.getElementById('create-group-name')?.value.trim() || '';
    const submitBtn = document.getElementById('create-group-submit-btn');
    
    if (submitBtn) {
        if (name.length < 2) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
        } else {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
        }
    }
}

function validateEditGroupForm() {
    const name = document.getElementById('edit-group-name')?.value.trim() || '';
    const submitBtn = document.getElementById('save-group-btn');
    
    if (submitBtn) {
        if (name.length < 2) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
        } else {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
        }
    }
}

// GRUPOS - Funcionalidades de pantalla
function showCreateGroupScreen() {
    const screen = document.getElementById('create-group-screen');
    if (screen) {
        screen.classList.add('active');
    }
    selectedMembers.clear();
    updateSelectedMembersList();
    validateGroupForm(); // Validación inicial
}

function hideCreateGroupScreen() {
    const screen = document.getElementById('create-group-screen');
    if (screen) {
        screen.classList.remove('active');
    }
}

function showSelectMembersScreen() {
    const screen = document.getElementById('select-members-screen');
    if (screen) {
        screen.classList.add('active');
    }
    loadMembersForSelection();
}

function hideSelectMembersScreen() {
    const screen = document.getElementById('select-members-screen');
    if (screen) {
        screen.classList.remove('active');
    }
}

function showEditGroupScreen() {
    if (!currentProfileGroup) return;
    
    const screen = document.getElementById('edit-group-screen');
    if (screen) {
        screen.classList.add('active');
    }
    
    const nameInput = document.getElementById('edit-group-name');
    const descInput = document.getElementById('edit-group-description');
    const preview = document.getElementById('group-avatar-preview');
    
    if (nameInput) nameInput.value = currentProfileGroup.name;
    if (descInput) descInput.value = currentProfileGroup.description;
    if (preview) preview.style.display = 'none';
    
    newGroupAvatarFile = null;
    validateEditGroupForm(); // Validación inicial
}

function hideEditGroupScreen() {
    const screen = document.getElementById('edit-group-screen');
    if (screen) {
        screen.classList.remove('active');
    }
}

function showJoinGroupModal(group) {
    currentProfileGroup = group;
    
    const nameElement = document.getElementById('join-group-name');
    const descElement = document.getElementById('join-group-description');
    const countElement = document.getElementById('join-group-members-count');
    
    if (nameElement) nameElement.textContent = group.name;
    if (descElement) descElement.textContent = group.description;
    if (countElement) countElement.textContent = group.members.length;
    
    updateGroupAvatarDisplay('join-group-avatar', group.avatar, group.name);
    
    const modal = document.getElementById('join-group-modal');
    if (modal) {
        modal.classList.add('active');
    }
}

function hideJoinGroupModal() {
    const modal = document.getElementById('join-group-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    currentProfileGroup = null;
}

// GRUPOS - Selección de miembros
function switchMembersTab(tabName) {
    document.querySelectorAll('.members-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.members-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-members-tab`);
    
    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
}

function loadMembersForSelection() {
    loadChatsMembers();
    loadAllMembers();
}

function loadChatsMembers() {
    const container = document.getElementById('chats-members-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const usersWithChats = activeChats
        .filter(chat => chat.type === 'private')
        .map(chat => chat.user);
    
    if (usersWithChats.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;"><div>No tienes chats activos</div></div>';
        return;
    }
    
    usersWithChats.forEach(user => {
        const memberItem = createMemberSelectItem(user);
        container.appendChild(memberItem);
    });
}

function loadAllMembers() {
    const container = document.getElementById('all-members-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const otherUsers = allUsers.filter(user => user.id !== currentUser.id);
    
    if (otherUsers.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;"><div>No hay otros usuarios</div></div>';
        return;
    }
    
    otherUsers.forEach(user => {
        const memberItem = createMemberSelectItem(user);
        container.appendChild(memberItem);
    });
}

function createMemberSelectItem(user) {
    const memberItem = document.createElement('div');
    memberItem.className = 'member-select-item';
    memberItem.dataset.userId = user.id;
    
    const isSelected = selectedMembers.has(user.id);
    
    memberItem.innerHTML = `
        <div class="member-select-checkbox"></div>
        <div class="user-avatar" style="width: 40px; height: 40px; margin-right: 12px;">
            ${getCachedAvatarHTML(user.avatar, user.name, 'user')}
        </div>
        <div class="user-info">
            <div class="user-name">${user.name}</div>
            <div class="user-status">${user.bio || "¡Yo uso SecureChat!"}</div>
        </div>
    `;
    
    if (isSelected) {
        memberItem.classList.add('selected');
    }
    
    memberItem.addEventListener('click', () => {
        toggleMemberSelection(user.id);
    });
    
    return memberItem;
}

function toggleMemberSelection(userId) {
    if (selectedMembers.has(userId)) {
        selectedMembers.delete(userId);
    } else {
        selectedMembers.add(userId);
    }
    
    document.querySelectorAll(`.member-select-item[data-user-id="${userId}"]`).forEach(item => {
        item.classList.toggle('selected');
    });
    
    updateSelectedMembersCount();
}

function filterMembers() {
    const searchTerm = document.getElementById('members-search-input')?.value.toLowerCase() || '';
    
    document.querySelectorAll('.member-select-item').forEach(item => {
        const userName = item.querySelector('.user-name')?.textContent.toLowerCase() || '';
        if (userName.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function updateSelectedMembersCount() {
    const count = selectedMembers.size;
    const countElement = document.getElementById('selected-members-count');
    if (countElement) {
        countElement.textContent = `${count} miembros seleccionados`;
    }
}

function updateSelectedMembersList() {
    const container = document.getElementById('selected-members-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    selectedMembers.forEach(userId => {
        const user = allUsers.find(u => u.id === userId);
        if (user) {
            const selectedMember = document.createElement('div');
            selectedMember.className = 'selected-member';
            selectedMember.innerHTML = `
                ${user.name}
                <button class="remove-member" data-user-id="${userId}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            container.appendChild(selectedMember);
        }
    });
    
    // Agregar event listeners a los botones de eliminar
    container.querySelectorAll('.remove-member').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = btn.dataset.userId;
            selectedMembers.delete(userId);
            updateSelectedMembersList();
            updateSelectedMembersCount();
            
            // Actualizar checkboxes
            document.querySelectorAll(`.member-select-item[data-user-id="${userId}"]`).forEach(item => {
                item.classList.remove('selected');
            });
        });
    });
}

function confirmMembersSelection() {
    updateSelectedMembersList();
    hideSelectMembersScreen();
}

// MEJORADO: Acciones de grupos
async function joinGroup() {
    if (!currentProfileGroup) return;
    
    const joinBtn = document.getElementById('confirm-join-group-btn');
    const originalText = joinBtn?.innerHTML || '';
    
    if (joinBtn) {
        joinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uniendo...';
        joinBtn.disabled = true;
    }
    
    try {
        const response = await fetch(`/api/groups/${currentProfileGroup.id}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (joinBtn) {
                joinBtn.innerHTML = '<i class="fas fa-check"></i> ¡Unido!';
            }
            
            setTimeout(() => {
                hideJoinGroupModal();
                openGroupChat(currentProfileGroup.id);
            }, 1000);
            
        } else {
            const error = await response.json();
            showNotification('Error: ' + error.error, 'error');
            if (joinBtn) {
                joinBtn.innerHTML = originalText;
                joinBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Error uniéndose al grupo:', error);
        showNotification('Error al unirse al grupo', 'error');
        if (joinBtn) {
            joinBtn.innerHTML = originalText;
            joinBtn.disabled = false;
        }
    }
}

async function leaveGroup() {
    if (!currentProfileGroup) return;
    
    if (!confirm('¿Estás seguro de que quieres salir de este grupo?')) {
        return;
    }
    
    const leaveBtn = document.getElementById('leave-group-btn');
    const originalText = leaveBtn?.innerHTML || '';
    
    if (leaveBtn) {
        leaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saliendo...';
        leaveBtn.disabled = true;
    }
    
    try {
        const response = await fetch(`/api/groups/${currentProfileGroup.id}/leave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUser.id
            })
        });
        
        if (response.ok) {
            if (leaveBtn) {
                leaveBtn.innerHTML = '<i class="fas fa-check"></i> ¡Salido!';
            }
            
            setTimeout(() => {
                hideGroupProfile();
                
                if (selectedGroup && selectedGroup.id === currentProfileGroup.id) {
                    showTab('chats');
                    selectedGroup = null;
                }
                
                socket.emit('get_all_groups');
                loadActiveChats();
            }, 1000);
            
        } else {
            const error = await response.json();
            showNotification('Error: ' + error.error, 'error');
            if (leaveBtn) {
                leaveBtn.innerHTML = originalText;
                leaveBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Error saliendo del grupo:', error);
        showNotification('Error al salir del grupo', 'error');
        if (leaveBtn) {
            leaveBtn.innerHTML = originalText;
            leaveBtn.disabled = false;
        }
    }
}

async function saveGroupChanges() {
    if (!currentProfileGroup) return;
    
    const name = document.getElementById('edit-group-name')?.value.trim() || '';
    const description = document.getElementById('edit-group-description')?.value.trim() || '';
    
    if (!name) {
        showNotification('El nombre del grupo es obligatorio', 'error');
        return;
    }
    
    const saveBtn = document.getElementById('save-group-btn');
    const originalText = saveBtn?.innerHTML || '';
    
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        saveBtn.disabled = true;
    }
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('userId', currentUser.id);
    
    if (newGroupAvatarFile) {
        formData.append('avatar', newGroupAvatarFile);
    }
    
    try {
        const response = await fetch(`/api/groups/${currentProfileGroup.id}`, {
            method: 'PUT',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-check"></i> ¡Guardado!';
            }
            
            setTimeout(() => {
                hideEditGroupScreen();
            }, 1000);
            
        } else {
            const error = await response.json();
            showNotification('Error: ' + error.error, 'error');
            if (saveBtn) {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Error actualizando grupo:', error);
        showNotification('Error al actualizar el grupo', 'error');
        if (saveBtn) {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }
}

// MEJORADO: GRUPOS - Perfiles
function showGroupProfile(groupId) {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) {
        console.error('Grupo no encontrado para perfil');
        return;
    }

    currentProfileGroup = group;
    updateGroupProfileDisplay();

    const screen = document.getElementById('group-profile-screen');
    if (screen) {
        screen.classList.add('active');
    }
}

function updateGroupProfileDisplay() {
    if (!currentProfileGroup) return;

    const nameElement = document.getElementById('group-profile-name');
    const descElement = document.getElementById('group-profile-description');
    const countElement = document.getElementById('group-members-count');
    const adminActions = document.getElementById('group-admin-actions');
    
    if (nameElement) nameElement.textContent = currentProfileGroup.name;
    if (descElement) descElement.textContent = currentProfileGroup.description;
    if (countElement) countElement.textContent = currentProfileGroup.members.length;
    
    updateGroupAvatarDisplay('group-profile-avatar', currentProfileGroup.avatar, currentProfileGroup.name);

    // Mostrar/ocultar botón de edición (solo para admin)
    if (adminActions) {
        const isAdmin = currentProfileGroup.creatorId === currentUser.id;
        adminActions.style.display = isAdmin ? 'flex' : 'none';
    }

    // Actualizar lista de miembros
    updateGroupMembersList();
}

function updateGroupMembersList() {
    const container = document.getElementById('group-members-list');
    if (!container) return;

    container.innerHTML = '';

    currentProfileGroup.members.forEach(memberId => {
        const user = allUsers.find(u => u.id === memberId);
        if (user) {
            const isOnline = onlineUsers.find(u => u.id === user.id);
            const isAdmin = memberId === currentProfileGroup.creatorId;
            
            const memberItem = document.createElement('div');
            memberItem.className = `member-item ${isAdmin ? 'admin' : ''}`;
            
            memberItem.innerHTML = `
                <div class="member-avatar">
                    ${getCachedAvatarHTML(user.avatar, user.name, 'user')}
                </div>
                <div class="member-info">
                    <div class="member-name">${user.name}${isAdmin ? ' (Admin)' : ''}</div>
                    <div class="member-status ${isOnline ? 'online' : ''}">
                        ${isOnline ? 'En línea' : 'Desconectado'}
                    </div>
                </div>
            `;

            // Solo el admin puede eliminar miembros (excepto a sí mismo)
            const isCurrentUserAdmin = currentProfileGroup.creatorId === currentUser.id;
            if (isCurrentUserAdmin && memberId !== currentUser.id) {
                memberItem.style.cursor = 'pointer';
                memberItem.title = `Eliminar a ${user.name} del grupo`;
                memberItem.addEventListener('click', () => {
                    if (confirm(`¿Eliminar a ${user.name} del grupo?`)) {
                        removeMemberFromGroup(memberId);
                    }
                });
            }

            container.appendChild(memberItem);
        }
    });
}

async function removeMemberFromGroup(memberId) {
    if (!currentProfileGroup) return;

    const memberItem = document.querySelector(`.member-item[data-user-id="${memberId}"]`);
    if (memberItem) {
        memberItem.style.opacity = '0.5';
    }

    try {
        const response = await fetch(`/api/groups/${currentProfileGroup.id}/members/${memberId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                adminId: currentUser.id
            })
        });

        if (response.ok) {
            showNotification('Miembro eliminado del grupo', 'success');
        } else {
            const error = await response.json();
            showNotification('Error: ' + error.error, 'error');
            if (memberItem) {
                memberItem.style.opacity = '1';
            }
        }
    } catch (error) {
        console.error('Error eliminando miembro:', error);
        showNotification('Error al eliminar miembro', 'error');
        if (memberItem) {
            memberItem.style.opacity = '1';
        }
    }
}

function hideGroupProfile() {
    const screen = document.getElementById('group-profile-screen');
    if (screen) {
        screen.classList.remove('active');
    }
    currentProfileGroup = null;
}

// MEJORADO: GRUPOS - Preview de avatares
function previewGroupAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        newGroupAvatarFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('group-avatar-preview');
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }
}

function previewCreateGroupAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        newGroupAvatarFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('create-group-avatar-preview');
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }
}

// FUNCIONES EXISTENTES MANTENIDAS (optimizadas)
function showMyProfile() {
    const screen = document.getElementById('my-profile-screen');
    if (screen) {
        screen.classList.add('active');
    }
    updateMyProfileDisplay();
    togglePanel(false);
}

function hideMyProfile() {
    const screen = document.getElementById('my-profile-screen');
    if (screen) {
        screen.classList.remove('active');
    }
}

function showEditProfile() {
    const screen = document.getElementById('edit-profile-screen');
    if (screen) {
        screen.classList.add('active');
    }
    
    const nameInput = document.getElementById('edit-profile-name');
    const bioInput = document.getElementById('edit-profile-bio');
    const passInput = document.getElementById('edit-profile-password');
    const preview = document.getElementById('avatar-preview');
    
    if (nameInput) nameInput.value = currentUser.name;
    if (bioInput) bioInput.value = currentUser.bio;
    if (passInput) passInput.value = '';
    if (preview) preview.style.display = 'none';
    
    newAvatarFile = null;
}

function hideEditProfile() {
    const screen = document.getElementById('edit-profile-screen');
    if (screen) {
        screen.classList.remove('active');
    }
}

function showFollowers() {
    const screen = document.getElementById('followers-screen');
    if (screen) {
        screen.classList.add('active');
    }
    loadFollowersList();
}

function hideFollowers() {
    const screen = document.getElementById('followers-screen');
    if (screen) {
        screen.classList.remove('active');
    }
}

function showFollowing() {
    const screen = document.getElementById('following-screen');
    if (screen) {
        screen.classList.add('active');
    }
    loadFollowingList();
}

function hideFollowing() {
    const screen = document.getElementById('following-screen');
    if (screen) {
        screen.classList.remove('active');
    }
}

function loadFollowersList() {
    const followersList = document.getElementById('followers-list');
    if (!followersList) return;

    followersList.innerHTML = '';

    if (followers.length === 0) {
        followersList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-users"></i>
                </div>
                <div class="empty-title">No tienes seguidores</div>
                <div class="empty-subtitle">Comparte tu perfil para conseguir seguidores</div>
            </div>
        `;
    } else {
        followers.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <div class="user-avatar">
                    ${getCachedAvatarHTML(user.avatar, user.name, 'user')}
                </div>
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-bio-small">${user.bio}</div>
                </div>
            `;

            userItem.addEventListener('click', () => showOtherUserProfile(user.id));
            followersList.appendChild(userItem);
        });
    }
}

function loadFollowingList() {
    const followingList = document.getElementById('following-list');
    if (!followingList) return;

    followingList.innerHTML = '';

    if (following.length === 0) {
        followingList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-user-plus"></i>
                </div>
                <div class="empty-title">No sigues a nadie</div>
                <div class="empty-subtitle">Encuentra usuarios interesantes para seguir</div>
            </div>
        `;
    } else {
        following.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <div class="user-avatar">
                    ${getCachedAvatarHTML(user.avatar, user.name, 'user')}
                </div>
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-bio-small">${user.bio}</div>
                </div>
            `;

            userItem.addEventListener('click', () => showOtherUserProfile(user.id));
            followingList.appendChild(userItem);
        });
    }
}

function showUserFollowers() {
    if (currentProfileUser) {
        showNotification('Mostrar seguidores de ' + currentProfileUser.name, 'info');
    }
}

function showUserFollowing() {
    if (currentProfileUser) {
        showNotification('Mostrar seguidos de ' + currentProfileUser.name, 'info');
    }
}

function previewAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        newAvatarFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('avatar-preview');
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }
}

async function saveMyProfile() {
    const newName = document.getElementById('edit-profile-name')?.value.trim() || '';
    const newBio = document.getElementById('edit-profile-bio')?.value.trim() || '';
    const newPassword = document.getElementById('edit-profile-password')?.value || '';

    if (!newName) {
        showNotification('El nombre no puede estar vacío', 'error');
        return;
    }

    const saveBtn = document.getElementById('save-profile-btn');
    const originalText = saveBtn?.innerHTML || '';
    
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        saveBtn.disabled = true;
    }

    const formData = new FormData();
    formData.append('name', newName);
    formData.append('bio', newBio || "¡Yo uso SecureChat!");

    if (newPassword) {
        formData.append('password', newPassword);
    }

    if (newAvatarFile) {
        formData.append('avatar', newAvatarFile);
    }

    try {
        const response = await fetch(`/api/profile/${currentUser.id}`, {
            method: 'PUT',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-check"></i> ¡Guardado!';
            }
            
            setTimeout(() => {
                updateCurrentUserDisplay();
                updateMyProfileDisplay();
                hideEditProfile();
            }, 1000);
            
        } else {
            const error = await response.json();
            showNotification('Error: ' + error.error, 'error');
            if (saveBtn) {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Error guardando perfil:', error);
        showNotification('Error al guardar el perfil', 'error');
        if (saveBtn) {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }
}

function deleteAccount() {
    if (confirm('¿Estás seguro de que quieres eliminar tu cuenta? Esta acción no se puede deshacer.')) {
        showNotification('Funcionalidad de eliminar cuenta - Pendiente de implementar', 'info');
    }
}

function showOtherUserProfile(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        console.error('Usuario no encontrado para perfil');
        return;
    }

    currentProfileUser = user;

    const nameElement = document.getElementById('user-profile-name');
    const bioElement = document.getElementById('user-profile-bio');
    const followersCount = document.getElementById('user-followers-count');
    const followingCount = document.getElementById('user-following-count');
    const followBtn = document.getElementById('follow-btn');
    
    if (nameElement) nameElement.textContent = user.name;
    if (bioElement) bioElement.textContent = user.bio;
    updateAvatarDisplay('user-profile-avatar', user.avatar, user.name);

    const isOnline = onlineUsers.find(u => u.id === user.id);
    const statusElement = document.getElementById('user-profile-online-status');
    if (statusElement) {
        statusElement.className = `online-status ${isOnline ? 'online' : ''}`;
    }

    if (followersCount) followersCount.textContent = '0';
    if (followingCount) followingCount.textContent = '0';

    if (followBtn) {
        const isFollowing = following.some(u => u.id === user.id);
        followBtn.textContent = isFollowing ? 'Dejar de seguir' : 'Seguir';
        followBtn.className = isFollowing ? 'follow-btn following' : 'follow-btn';
    }

    const screen = document.getElementById('user-profile-screen');
    if (screen) {
        screen.classList.add('active');
    }
}

function toggleFollow() {
    if (!currentProfileUser) return;

    const isFollowing = following.some(u => u.id === currentProfileUser.id);

    socket.emit('toggle_follow', {
        followerId: currentUser.id,
        followingId: currentProfileUser.id
    });

    const followBtn = document.getElementById('follow-btn');
    if (followBtn) {
        if (isFollowing) {
            following = following.filter(u => u.id !== currentProfileUser.id);
            followBtn.textContent = 'Seguir';
            followBtn.className = 'follow-btn';
        } else {
            const user = allUsers.find(u => u.id === currentProfileUser.id);
            if (user) following.push(user);
            followBtn.textContent = 'Dejar de seguir';
            followBtn.className = 'follow-btn following';
        }
    }

    updateFollowCounts();
}

function hideUserProfile() {
    const screen = document.getElementById('user-profile-screen');
    if (screen) {
        screen.classList.remove('active');
    }
    currentProfileUser = null;
}

function updateCurrentUserDisplay() {
    const nameElement = document.getElementById('panel-user-name');
    const bioElement = document.getElementById('panel-user-bio');
    
    if (nameElement) nameElement.textContent = currentUser.name;
    if (bioElement) bioElement.textContent = currentUser.bio;
    updateAvatarDisplay('panel-user-avatar', currentUser.avatar, currentUser.name);
}

function updateMyProfileDisplay() {
    const nameElement = document.getElementById('my-profile-name');
    const bioElement = document.getElementById('my-profile-bio');
    
    if (nameElement) nameElement.textContent = currentUser.name;
    if (bioElement) bioElement.textContent = currentUser.bio;
    updateAvatarDisplay('my-profile-avatar', currentUser.avatar, currentUser.name);
    updateFollowCounts();
}

function updateUnreadBadge(userId, count) {
    const badge = document.getElementById(`chat-unread-${userId}`);
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function updateUnreadBadges() {
    Object.keys(unreadCounts).forEach(userId => {
        updateUnreadBadge(userId, unreadCounts[userId]);
    });
}

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = '/';
}

// MEJORADO: Función para forzar actualización de avatar específico
function refreshAvatar(elementId, newAvatarUrl, name) {
    // Eliminar del cache para forzar recarga
    const cacheKeys = Array.from(avatarCache.keys()).filter(key => key.startsWith(elementId));
    cacheKeys.forEach(key => avatarCache.delete(key));
    
    // Actualizar display
    if (elementId.includes('group')) {
        updateGroupAvatarDisplay(elementId, newAvatarUrl, name);
    } else {
        updateAvatarDisplay(elementId, newAvatarUrl, name);
    }
}

// Inicializar validación de formularios
document.addEventListener('DOMContentLoaded', function() {
    const groupNameInput = document.getElementById('create-group-name');
    const editGroupNameInput = document.getElementById('edit-group-name');
    const membersSearchInput = document.getElementById('members-search-input');
    
    if (groupNameInput) {
        groupNameInput.addEventListener('input', validateGroupForm);
    }
    
    if (editGroupNameInput) {
        editGroupNameInput.addEventListener('input', validateEditGroupForm);
    }
    
    if (membersSearchInput) {
        membersSearchInput.addEventListener('input', filterMembers);
    }
    
    // Inicializar tabs de selección de miembros
    document.querySelectorAll('.members-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchMembersTab(tabName);
        });
    });
});

// Limpiar cache cada hora
setInterval(() => {
    const now = Date.now();
    for (let [key, value] of avatarCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            avatarCache.delete(key);
        }
    }
}, 60 * 60 * 1000);