const router = express.Router();
// const { getAllUsers, getUserById, createUser, updateUser, deleteUser } = require('../controllers/userController');

// // Define routes for user-related operations
// router.get('/users', getAllUsers); // Get all users
// router.get('/users/:id', getUserById); // Get a user by ID
// router.post('/users', createUser); // Create a new user
// router.put('/users/:id', updateUser); // Update a user by ID
// router.delete('/users/:id', deleteUser); // Delete a user by ID

// module.exports = router;


const faculty = [
  {
    id: 1,
    facultyName: 'Faculty of Engineering and Technology',
    facultyCode: 'FET',
    departments: [
      {
        id: 1,
        departmentName: 'Department of Computer Science',
        departmentCode: 'CSC'
      },
      {
        id: 2,
        departmentName: 'Department of Electrical Engineering',
        departmentCode: 'EEE'
      },
      {
        id: 3,
        departmentName: 'Department of Mechanical Engineering',
        departmentCode: 'MEC'
      },
      {
        id: 4,
        departmentName: 'Department of Civil Engineering',
        departmentCode: 'CVE'
      },
      {
        id: 5,
        departmentName: 'Department of Chemical Engineering',
        departmentCode: 'CHE'
      },
      {
        id: 6,
        departmentName: 'Department of Agricultural Engineering',
        departmentCode: 'AGL'
      },
      {
        id: 7,
        departmentName: 'Department of Food Engineering',
        departmentCode: 'FED'
      }
    ]
  },
  {
    id: 2,
    facultyName: 'Faculty of Computing and informatics',
    facultyCode: 'FOS',
    departments: [
      {
        id: 1,
        departmentName: 'Department of Computer Science',
        departmentCode: 'CSC'
      },
      {
        id: 2,
        departmentName: 'Department of Information systems',
        departmentCode: 'IT'
      },
      {
        id: 3,
        departmentName: 'Department of Cyber Security Science',
        departmentCode: 'CS'
      },
    ]
  },
  {
    id: 3,
    facultyName: 'Faculty of Pure and Applied Sciences',
    facultyCode: 'FPA',
    departments: [
      {
        id: 1,
        departmentName: 'Department of Pure and Applied Mathematics',
        departmentCode: 'MTH'
      },
      {
        id: 2,
        departmentName: 'Department of Pure and Applied Physics',
        departmentCode: 'PHY'
      },
      {
        id: 3,
        departmentName: 'Department of Pure and Applied Chemistry',
        departmentCode: 'CHE'
      },
      {
        id: 4,
        departmentName: 'Department of Pure and Applied Biology',
        departmentCode: 'BIO'
      },
      {
        id: 5,
        departmentName: 'Department of Statistics',
        departmentCode: 'STA'
      },
      {
        id: 6,
        departmentName: 'Department of Earth Science',
        departmentCode: 'ENV'
      },
      {
        id: 7,
        departmentName: 'Department of Science Laboratory Technology',
        departmentCode: 'SLT'
      }
    ]
  },
  {
    id: 4,
    facultyName: 'Faculty of Agr',
    facultyCode: 'FOS',
  }
]