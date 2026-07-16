export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatar?: string;
  role: Role;
  status: 'active' | 'disabled' | 'locked';
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, Record<string, boolean>>;
  isSystem: boolean;
}

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  birthDate: string;
  phone?: string;
  email?: string;
  idCard?: string;
  insuranceNo?: string;
  address?: string;
  avatar?: string;
  notes?: string;
  tags: string[];
  customFields?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Study {
  id: string;
  patientId: string;
  studyDate: string;
  studyTime?: string;
  device?: string;
  physicianId?: string;
  status: 'pending' | 'in_progress' | 'diagnosed' | 'reported';
  description?: string;
  tags?: string[];
  series?: Series[];
  createdAt: string;
  updatedAt: string;
}

export interface Series {
  id: string;
  studyId: string;
  seriesNumber: number;
  seriesDescription?: string;
  modality: string;
  bodyPart?: string;
  imageCount: number;
  createdAt: string;
}

export interface Image {
  id: string;
  seriesId: string;
  instanceNumber: number;
  filePath: string;
  fileSize: number;
  fileHash: string;
  format: 'dicom' | 'jpeg' | 'png' | 'tiff' | 'bmp';
  width: number;
  height: number;
  bitsAllocated: number;
  thumbnailPath?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface Annotation {
  id: string;
  imageId: string;
  userId: string;
  layerId?: string;
  type: 'measurement' | 'arrow' | 'text' | 'freehand' | 'roi' | 'highlight';
  geometry: Record<string, any>;
  style: Record<string, any>;
  label?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Layer {
  id: string;
  imageId: string;
  name: string;
  type: 'image' | 'annotation' | 'ai_result';
  visible: boolean;
  opacity: number;
  locked: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Report {
  id: string;
  studyId: string;
  patientId: string;
  templateId: string;
  title: string;
  content: Record<string, any>;
  images: string[];
  status: 'draft' | 'pending_review' | 'reviewed' | 'published';
  reviewerId?: string;
  reviewNotes?: string;
  publishedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  type: 'oct' | 'fundus' | 'ffa' | 'icga' | 'vf' | 'octa' | 'comprehensive' | 'custom';
  description?: string;
  fields: Record<string, any>[];
  layout: Record<string, any>;
  isSystem: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
