export default function handler(req, res) {
    // Apenas permitir método GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Retornar as credenciais do IronPay
    // Em produção, essas devem vir de process.env
    const config = {
        api_token: process.env.IRONPAY_API_TOKEN || '1NW287lbfrc2zlJFRS3p9JYuN68Mz8sxw5sWMNqrgBo5Hc6My3AwZvvf6dpQ',
        product_hash: process.env.IRONPAY_PRODUCT_HASH || 'snx2ginhct',
        offer_hash: process.env.IRONPAY_OFFER_HASH || 't8vmgiaftf'
    };

    res.status(200).json(config);
}