const faculty = [
  {
    id: 1,
    facultyName: 'Faculty of Engineering and Technology',
    facultyCode: 'FET',
    departments: [
      { id: 1, departmentName: 'Department of Computer Science', departmentCode: 'CSC' },
      { id: 2, departmentName: 'Department of Electrical Engineering', departmentCode: 'EEE' },
      { id: 3, departmentName: 'Department of Mechanical Engineering', departmentCode: 'MEC' },
      { id: 4, departmentName: 'Department of Civil Engineering', departmentCode: 'CVE' },
      { id: 5, departmentName: 'Department of Chemical Engineering', departmentCode: 'CHE' },
      { id: 6, departmentName: 'Department of Agricultural Engineering', departmentCode: 'AGL' },
      { id: 7, departmentName: 'Department of Food Engineering', departmentCode: 'FED' }
    ]
  },
  {
    id: 2,
    facultyName: 'Faculty of Computing and Informatics',
    facultyCode: 'FOS',
    departments: [
      { id: 1, departmentName: 'Department of Computer Science', departmentCode: 'CSC' },
      { id: 2, departmentName: 'Department of Information Systems', departmentCode: 'IT' },
      { id: 3, departmentName: 'Department of Cyber Security Science', departmentCode: 'CS' }
    ]
  },
  {
    id: 3,
    facultyName: 'Faculty of Pure and Applied Sciences',
    facultyCode: 'FPA',
    departments: [
      { id: 1, departmentName: 'Department of Pure and Applied Mathematics', departmentCode: 'MTH' },
      { id: 2, departmentName: 'Department of Pure and Applied Physics', departmentCode: 'PHY' },
      { id: 3, departmentName: 'Department of Pure and Applied Chemistry', departmentCode: 'CHE' },
      { id: 4, departmentName: 'Department of Pure and Applied Biology', departmentCode: 'BIO' },
      { id: 5, departmentName: 'Department of Statistics', departmentCode: 'STA' },
      { id: 6, departmentName: 'Department of Earth Science', departmentCode: 'ENV' },
      { id: 7, departmentName: 'Department of Science Laboratory Technology', departmentCode: 'SLT' }
    ]
  },
  {
    id: 4,
    facultyName: 'Faculty of Agriculture Sciences',
    facultyCode: 'FAG',
    departments: [
      { id: 1, departmentName: 'Department of Agricultural Economics', departmentCode: 'AGE' },
      { id: 2, departmentName: 'Department of Agricultural Extension and Rural Development', departmentCode: 'AER' },
      { id: 3, departmentName: 'Department of Animal Nutrition and Biotechnology', departmentCode: 'ANI' },
      { id: 4, departmentName: 'Department of Animal Production and Health', departmentCode: 'AHP' },
      { id: 5, departmentName: 'Department of Crop and Environmental Production', departmentCode: 'CRO' },
      { id: 6, departmentName: 'Department of Crop Production and Soil Science', departmentCode: 'SDL' }
    ]
  },
  {
    id: 5,
    facultyName: 'Faculty of Renewable Natural Resources (Iseyin Campus)',
    facultyCode: 'FRN',
    departments: [
      { id: 1, departmentName: 'Department of Fisheries and Aquaculture', departmentCode: 'FIA' },
      { id: 2, departmentName: 'Department of Forest Resources Management', departmentCode: 'FRM' },
      { id: 3, departmentName: 'Department of Wildlife and Ecotourism Management', departmentCode: 'WEM' }
    ]
  },
  {
    id: 6,
    facultyName: 'Faculty of Management Sciences',
    facultyCode: 'FMS',
    departments: [
      { id: 1, departmentName: 'Department of Business Management', departmentCode: 'BAM' },
      { id: 2, departmentName: 'Department of Accounting', departmentCode: 'ACC' },
      { id: 3, departmentName: 'Department of Economics', departmentCode: 'ECO' },
      { id: 4, departmentName: 'Department of Marketing', departmentCode: 'MKT' },
      { id: 5, departmentName: 'Department of Transport Management', departmentCode: 'TRM' }
    ]
  },
  {
    id: 7,
    facultyName: 'Faculty of Environmental Sciences',
    facultyCode: 'FEM',
    departments: [
      { id: 1, departmentName: 'Department of Estate Management', departmentCode: 'EVM' },
      { id: 2, departmentName: 'Department of Urban and Regional Planning', departmentCode: 'URP' },
      { id: 3, departmentName: 'Department of Surveying and Geo-informatics', departmentCode: 'SGI' },
      { id: 4, departmentName: 'Department of Building', departmentCode: 'BID' },
      { id: 5, departmentName: 'Department of Architecture', departmentCode: 'ARC' },
      { id: 6, departmentName: 'Department of Fine and Applied Arts', departmentCode: 'FAA' }
    ]
  },
  {
    id: 8,
    facultyName: 'Faculty of Food and Consumer Sciences',
    facultyCode: 'FEC',
    departments: [
      { id: 1, departmentName: 'Department of Food Science', departmentCode: 'FST' },
      { id: 2, departmentName: 'Department of Consumer Science/Home Economics', departmentCode: 'CHS' },
      { id: 3, departmentName: 'Department of Nutrition and Dietetics', departmentCode: 'NDS' }
    ]
  },
  {
    id: 9,
    facultyName: 'Faculty of Arts and Social Sciences',
    facultyCode: 'FAS',
    departments: [
      { id: 1, departmentName: 'Department of English and Literary Studies', departmentCode: 'ELS' },
      { id: 2, departmentName: 'Department of Linguistic and Yoruba Studies', departmentCode: 'LYS' },
      { id: 3, departmentName: 'Department of History', departmentCode: 'HIS' },
      { id: 4, departmentName: 'Department of Philosophy', departmentCode: 'PHI' },
      { id: 5, departmentName: 'Department of Political Science', departmentCode: 'POL' },
      { id: 6, departmentName: 'Department of Sociology', departmentCode: 'SOC' },
      { id: 7, departmentName: 'Department of Mass Communication', departmentCode: 'MCM' },
      { id: 8, departmentName: 'Department of Theatre Arts', departmentCode: 'TAA' },
      { id: 9, departmentName: 'Department of Psychology', departmentCode: 'PSY' }
    ]
  },
  {
    id: 10,
    facultyName: 'CHS - Faculty of Basic Medical Sciences',
    facultyCode: 'FBMS',
    departments: [
      { id: 1, departmentName: 'Department of Anatomy', departmentCode: 'ANA' },
      { id: 2, departmentName: 'Department of Biochemistry', departmentCode: 'BCH' },
      { id: 3, departmentName: 'Department of Medical Laboratory Science', departmentCode: 'MLS' },
      { id: 4, departmentName: 'Department of Physiology', departmentCode: 'PHY' }
    ]
  },
  {
    id: 11,
    facultyName: 'CHS - Faculty of Clinical Sciences',
    facultyCode: 'FC',
    departments: [
      { id: 1, departmentName: 'Department of Medicine', departmentCode: 'MED' },
      { id: 2, departmentName: 'Department of Surgery', departmentCode: 'SUR' },
      { id: 3, departmentName: 'Department of Obstetrics and Gynaecology', departmentCode: 'PHA' },
      { id: 4, departmentName: 'Department of Paediatrics', departmentCode: 'PAD' },
      { id: 5, departmentName: 'Department of Radiology', departmentCode: 'RAD' },
      { id: 6, departmentName: 'Department of Anaesthesia', departmentCode: 'ANA' },
      { id: 7, departmentName: 'Department of Ophthalmology', departmentCode: 'OP' }
    ]
  },
  {
    id: 12,
    facultyName: 'CHS - Faculty of Basic and Clinical Sciences',
    facultyCode: 'FB',
    departments: [
      { id: 1, departmentName: 'Department of Chemical Pathology', departmentCode: 'CHM' },
      { id: 2, departmentName: 'Department of Haematology/Blood Transfusion', departmentCode: 'HAL' },
      { id: 3, departmentName: 'Department of Medical Microbiology/Parasitology', departmentCode: 'IMM' },
      { id: 4, departmentName: 'Department of Morbid Anatomy and Histopathology', departmentCode: 'MAH' }
    ]
  },
  {
    id: 13,
    facultyName: 'CHS - Faculty of Nursing Sciences',
    facultyCode: 'FNS',
    departments:[
      {
        id: 1,
        departmentName: 'Department of Nursing Sciences',
        departmentCode: 'NUR'
      }
    ]
  }
]

module.exports = faculty;