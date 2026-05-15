function getRoleName(role) {
    const roles = {
        'manager': 'مدير',
        'inventory_keeper': 'أمين مخزن',
        'employee': 'موظف',
        'volunteer': 'متطوع',
        'donor': 'مانح',
        'beneficiary': 'مستفيد'
    };
    return roles[role] || role;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-EG');
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('ar-EG');
}

window.getRoleName = getRoleName;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;