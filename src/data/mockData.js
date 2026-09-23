// ---------------------------------------------------------------------------
// Mock data layer.
//
// This stands in for the Node.js/Express + PostgreSQL backend described in
// section 6 of the spec. Every screen reads/writes through src/data/store.js,
// which wraps these arrays. When the real backend exists, swap store.js's
// internals for fetch() calls against your API -- the screens themselves
// don't need to change since they only call store methods.
// ---------------------------------------------------------------------------

export const initialResources = [
  {
    id: 'R-001',
    name: 'Divya Shankar',
    phone: '9840012345',
    email: 'divya.shankar@example.org',
    address: 'Alwarpet, Chennai',
    type: 'Volunteer',
    role: 'Facilitator',
    bloodGroup: 'O+',
    emergencyContact: '9840099999',
    contractStart: '2026-06-01',
    contractEnd: '2027-05-31',
    facialDataCaptured: true,
    password: 'changeme123',
    mustChangePassword: false,
  },
  {
    id: 'R-023',
    name: 'Karthik Raman',
    phone: '9840023456',
    email: 'karthik.raman@example.org',
    address: 'Anna Nagar, Chennai',
    type: 'Honorary Staff',
    role: 'Facilitator',
    bloodGroup: 'B+',
    emergencyContact: '9840088888',
    contractStart: '2026-04-01',
    contractEnd: '2027-03-31',
    facialDataCaptured: true,
    password: 'changeme123',
    mustChangePassword: true,
  },
  {
    id: 'R-002',
    name: 'Priya Menon',
    phone: '9840034567',
    email: 'priya.menon@example.org',
    address: 'T. Nagar, Chennai',
    type: 'Staff',
    role: 'Admin',
    bloodGroup: 'A+',
    emergencyContact: '9840077777',
    contractStart: '2025-01-01',
    contractEnd: '2028-12-31',
    facialDataCaptured: false,
    password: 'changeme123',
    mustChangePassword: false,
  },
];

export const initialBeneficiaries = [
  { id: 'EC-ALW-CL6-A', school: 'Alwarpet School', class: 'Class 6', section: 'A' },
  { id: 'EC-ALW-CL6-B', school: 'Alwarpet School', class: 'Class 6', section: 'B' },
  { id: 'EC-CAN-CL6-B', school: 'Canal Road School', class: 'Class 6', section: 'B' },
  { id: 'EC-NSG-MIX-X', school: 'NS Garden', class: 'Mixed', section: 'X' },
];

export const initialCategories = [
  { id: 'LSS-VE-OTH-000', pillar: 'Value Education', topic: 'OTHERS', subtopic: 'OTHERS' },
  { id: 'LSS-EE-OTH-000', pillar: 'Environment Education', topic: 'OTHERS', subtopic: 'OTHERS' },
  { id: 'LSS-HH-OTH-000', pillar: 'Health & Hygiene', topic: 'OTHERS', subtopic: 'OTHERS' },
  { id: 'LSS-SS-CS-001', pillar: 'Soft Skills', topic: 'Communication Skills', subtopic: 'Empathy' },
  { id: 'LSS-SS-CS-002', pillar: 'Soft Skills', topic: 'Communication Skills', subtopic: 'Body Language' },
  { id: 'LSS-CR-OTH-000', pillar: 'Creativity', topic: 'OTHERS', subtopic: 'OTHERS' },
];

export const initialGeo = [
  { id: 'GEO-ALW', school: 'Alwarpet School', lat: 13.0343, lng: 80.2545, radiusMeters: 150 },
  { id: 'GEO-CAN', school: 'Canal Road School', lat: 13.0500, lng: 80.2121, radiusMeters: 150 },
  { id: 'GEO-NSG', school: 'NS Garden', lat: 13.0067, lng: 80.2206, radiusMeters: 150 },
];

export const initialSchedule = [
  {
    id: 'SCH-0001',
    beneficiaryId: 'EC-ALW-CL6-A',
    facilitatorId: 'R-001',
    date: '2026-09-18',
    time: '10:00',
    categoryId: 'LSS-SS-CS-002',
  },
  {
    id: 'SCH-0002',
    beneficiaryId: 'EC-CAN-CL6-B',
    facilitatorId: 'R-023',
    date: '2026-09-19',
    time: '11:30',
    categoryId: 'LSS-VE-OTH-000',
  },
];

export const initialPsr = [
  {
    id: 'PSR-0001',
    beneficiaryId: 'EC-ALW-CL6-A',
    facilitatorId: 'R-001',
    date: '2026-09-16',
    timeIn: '10:02 AM',
    timeOut: '10:58 AM',
    categoryId: 'LSS-SS-CS-002',
    studentsPresent: 28,
    rating: 'Good',
    rag: 'Amber',
    facilitatorFeedback: 'Good engagement, a few students shy to role-play.',
    schoolFeedback: 'Requested more sessions on this topic.',
    photosUploaded: true,
  },
  {
    id: 'PSR-0002',
    beneficiaryId: 'EC-CAN-CL6-B',
    facilitatorId: 'R-023',
    date: '2026-09-12',
    timeIn: '11:32 AM',
    timeOut: '12:20 PM',
    categoryId: 'LSS-SS-CS-001',
    studentsPresent: 31,
    rating: 'Excellent',
    rag: 'Green',
    facilitatorFeedback: 'Empathy circle activity landed very well.',
    schoolFeedback: '',
    photosUploaded: true,
  },
];

export const initialUploads = [
  {
    id: 'UPL-0001',
    fileName: 'session_alwarpet_16sep.jpg',
    beneficiaryId: 'EC-ALW-CL6-A',
    categoryId: 'LSS-SS-CS-002',
    facilitatorId: 'R-001',
    date: '2026-09-16',
    description: 'Role-play activity photo',
  },
];

export const initialContent = [
  {
    id: 'CNT-0001',
    title: 'Body Language Basics -- facilitator deck',
    categoryId: 'LSS-SS-CS-002',
    fileType: 'PPT',
    uploadedBy: 'R-002',
    date: '2026-09-01',
  },
  {
    id: 'CNT-0002',
    title: 'Empathy circle activity guide',
    categoryId: 'LSS-SS-CS-001',
    fileType: 'PDF',
    uploadedBy: 'R-002',
    date: '2026-08-14',
  },
];

export const initialOverrides = [];

export const initialSystemParameters = {
  productType: 'Education',
  orgName: 'Maitri Trust',
  maxNamedUsers: 999,
  productValidityEnd: '2027-05-31',
  loginByEmail: false,
  gpsOnBeneficiary: true,
  allowedUploadTypes: ['photo', 'pdf', 'ppt'],
};
