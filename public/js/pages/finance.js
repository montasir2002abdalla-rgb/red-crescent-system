const user = requireAuth(['donor']);
updateUserDisplay();
initFloatingBell();

function showPaymentDetails() {
    const method = document.getElementById('paymentMethod').value;
    document.getElementById('bankDetails').style.display = method === 'bank' ? 'block' : 'none';
    document.getElementById('fawryDetails').style.display = method === 'fawry' ? 'block' : 'none';
}

document.getElementById('donationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const donation = {
        amount: parseFloat(document.getElementById('amount').value),
        paymentMethod: document.getElementById('paymentMethod').value,
        transactionId: document.getElementById('transactionId').value
    };
    try {
        const result = await createDonation(donation);
        alert('تم تسجيل تبرعك، شكراً لك!');
        document.getElementById('donationForm').reset();
        loadMyDonations();
    } catch (error) {
        alert(error.message);
    }
});

document.getElementById('inkindForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inkind = {
        itemName: document.getElementById('inkindItemName').value,
        category: document.getElementById('inkindCategory').value,
        quantity: parseInt(document.getElementById('inkindQuantity').value),
        unit: document.getElementById('inkindUnit').value,
        description: document.getElementById('inkindDescription').value
    };
    try {
        const result = await createInkindDonation(inkind);
        alert('تم تسجيل تبرعك العيني وإضافته للمخزون، شكراً لك!');
        document.getElementById('inkindForm').reset();
        loadMyDonations();
    } catch (error) {
        alert(error.message);
    }
});

async function loadMyDonations() {
    try {
        const donations = await getDonations();
        const tbody = document.getElementById('myDonationsBody');
        tbody.innerHTML = donations.map(d => {
            if (d.donationType === 'financial') {
                return `<tr>
                    <td data-label="النوع">مالي</td>
                    <td data-label="المبلغ">${d.amount || 0} جنيه</td>
                    <td data-label="التفاصيل">${d.paymentMethod || '-'} (${d.transactionId || '-'})</td>
                    <td data-label="التاريخ">${new Date(d.createdAt).toLocaleDateString('ar-EG')}</td>
                </tr>`;
            } else {
                return `<tr>
                    <td data-label="النوع">عيني</td>
                    <td data-label="الكمية">${d.quantity || 0} ${d.unit || ''}</td>
                    <td data-label="التفاصيل">${d.item_name || d.itemName || ''}</td>
                    <td data-label="التاريخ">${new Date(d.createdAt).toLocaleDateString('ar-EG')}</td>
                </tr>`;
            }
        }).join('') || '<tr><td colspan="4">لا توجد تبرعات</td></tr>';
    } catch (error) {
        console.error('خطأ في تحميل التبرعات:', error);
        document.getElementById('myDonationsBody').innerHTML = '<tr><td colspan="4">خطأ في تحميل البيانات</td></tr>';
    }
}

function showTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if (tab === 'financial') {
        document.querySelector('[onclick="showTab(\'financial\')"]').classList.add('active');
        document.getElementById('financialTab').classList.add('active');
    } else {
        document.querySelector('[onclick="showTab(\'inkind\')"]').classList.add('active');
        document.getElementById('inkindTab').classList.add('active');
    }
}

window.showTab = showTab;
window.showPaymentDetails = showPaymentDetails;

loadMyDonations();