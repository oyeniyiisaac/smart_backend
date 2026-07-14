    const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    // 1. Grab the authorization header from the incoming request
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            message: "Access denied. No authentication token provided." 
        });
    }

    // 2. Extract the actual JWT string
    const token = authHeader.split(' ')[1];

    try {
        // 3. Verify the token using your environment's secret key
        // Make sure process.env.JWT_SECRET matches what you used during student login/sign-up!
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 4. Attach the decoded payload (e.g., matricno, id) to req.user
        req.user = decoded; 
        
        // Move to the controller (verifyStudentLocation)
        next(); 
    } catch (error) {
        console.error("❌ Token Verification Error:", error.message);
        return res.status(403).json({ 
            message: "Authentication failed. Invalid or expired token." 
        });
    }
};

module.exports = verifyToken;