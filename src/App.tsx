import { Suspense, lazy, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { RequireAuth, RequirePermission, NotFoundPage } from './app/guards';
import { useAuth } from './services/auth';
import { homePathFor } from './shared/permissions';
import { FullPageLoader } from './components/ui/States';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));

const StudentsPage = lazy(() => import('./pages/admin/StudentsPage'));
const TeachersPage = lazy(() => import('./pages/admin/TeachersPage'));
const ProctorsPage = lazy(() => import('./pages/admin/ProctorsPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const SchoolsPage = lazy(() => import('./pages/admin/SchoolsPage'));
const AcademicYearsPage = lazy(() => import('./pages/admin/AcademicYearsPage'));
const ClassesPage = lazy(() => import('./pages/admin/ClassesPage'));
const SubjectsPage = lazy(() => import('./pages/admin/SubjectsPage'));
const RoomsPage = lazy(() => import('./pages/admin/RoomsPage'));
const ExamTypesPage = lazy(() => import('./pages/admin/ExamTypesPage'));
const QuestionBankPage = lazy(() => import('./pages/admin/QuestionBankPage'));
const QuestionEditorPage = lazy(() => import('./pages/admin/QuestionEditorPage'));
const FormsPage = lazy(() => import('./pages/admin/FormsPage'));
const FormBuilderPage = lazy(() => import('./pages/admin/FormBuilderPage'));
const SchedulesPage = lazy(() => import('./pages/admin/SchedulesPage'));
const ScheduleDetailPage = lazy(() => import('./pages/admin/ScheduleDetailPage'));
const ResultsPage = lazy(() => import('./pages/admin/ResultsPage'));
const GradingPage = lazy(() => import('./pages/admin/GradingPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const AuditPage = lazy(() => import('./pages/admin/AuditPage'));
const QuotaPage = lazy(() => import('./pages/admin/QuotaPage'));

const ProctorDashboardPage = lazy(() => import('./pages/proctor/ProctorDashboardPage'));
const ProctorSessionsPage = lazy(() => import('./pages/proctor/ProctorSessionsPage'));
const ProctorSessionPage = lazy(() => import('./pages/proctor/ProctorSessionPage'));
const ProctorReportsPage = lazy(() => import('./pages/proctor/ProctorReportsPage'));

const StudentHomePage = lazy(() => import('./pages/student/StudentHomePage'));
const ExamPlayerPage = lazy(() => import('./pages/student/ExamPlayerPage'));
const StudentResultsPage = lazy(() => import('./pages/student/StudentResultsPage'));
const ResultDetailPage = lazy(() => import('./pages/student/ResultDetailPage'));

const AttendancePrintPage = lazy(() => import('./pages/print/AttendancePrintPage'));
const BeritaAcaraPrintPage = lazy(() => import('./pages/print/BeritaAcaraPrintPage'));

function page(Component: ComponentType) {
  return (
    <Suspense fallback={<FullPageLoader label="Memuat halaman…" />}>
      <Component />
    </Suspense>
  );
}

function HomeRedirect() {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageLoader label="Memeriksa sesi…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(user.roles)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={page(LoginPage)} />

      {/* Halaman cetak (A4) di luar layout aplikasi agar bersih saat diprint */}
      <Route element={<RequireAuth />}>
        <Route path="/cetak/kehadiran/:sessionId" element={page(AttendancePrintPage)} />
        <Route path="/cetak/berita-acara/:sessionId" element={page(BeritaAcaraPrintPage)} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route element={<RequireAuth roles={['admin', 'superadmin', 'teacher']} />}>
            <Route path="/guru" element={page(DashboardPage)} />
            <Route path="/admin" element={page(DashboardPage)} />
          </Route>
          <Route element={<RequirePermission permission="school.manage" />}>
            <Route path="/admin/academic-years" element={page(AcademicYearsPage)} />
          </Route>
          <Route element={<RequirePermission permission="class.manage" />}>
            <Route path="/admin/classes" element={page(ClassesPage)} />
          </Route>
          <Route element={<RequirePermission permission="subject.manage" />}>
            <Route path="/admin/subjects" element={page(SubjectsPage)} />
          </Route>
          <Route element={<RequirePermission permission="schedule.manage" />}>
            <Route path="/admin/rooms" element={page(RoomsPage)} />
            <Route path="/admin/schedules" element={page(SchedulesPage)} />
            <Route path="/admin/schedules/:id" element={page(ScheduleDetailPage)} />
          </Route>
          <Route element={<RequirePermission permission="student.manage" />}>
            <Route path="/admin/students" element={page(StudentsPage)} />
          </Route>
          <Route element={<RequirePermission permission="user.manage" />}>
            <Route path="/admin/teachers" element={page(TeachersPage)} />
            <Route path="/admin/proctors" element={page(ProctorsPage)} />
            <Route path="/admin/users" element={page(UsersPage)} />
          </Route>
          <Route element={<RequireAuth roles={['superadmin']} />}>
            <Route path="/admin/schools" element={page(SchoolsPage)} />
          </Route>
          <Route element={<RequirePermission permission="examtype.manage" />}>
            <Route path="/admin/exam-types" element={page(ExamTypesPage)} />
          </Route>
          <Route element={<RequirePermission permission="question.manage" />}>
            <Route path="/admin/questions" element={page(QuestionBankPage)} />
            <Route path="/admin/questions/new" element={page(QuestionEditorPage)} />
            <Route path="/admin/questions/:id" element={page(QuestionEditorPage)} />
          </Route>
          <Route element={<RequirePermission permission="form.manage" />}>
            <Route path="/admin/forms" element={page(FormsPage)} />
            <Route path="/admin/forms/:id" element={page(FormBuilderPage)} />
          </Route>
          <Route element={<RequirePermission permission="analysis.read" />}>
            <Route path="/admin/results" element={page(ResultsPage)} />
          </Route>
          <Route element={<RequirePermission permission="result.grade" />}>
            <Route path="/admin/grading" element={page(GradingPage)} />
          </Route>
          <Route element={<RequirePermission permission="settings.manage" />}>
            <Route path="/admin/settings" element={page(SettingsPage)} />
            <Route path="/admin/quota" element={page(QuotaPage)} />
          </Route>
          <Route element={<RequirePermission permission="audit.read" />}>
            <Route path="/admin/audit" element={page(AuditPage)} />
          </Route>

          <Route element={<RequireAuth roles={['proctor', 'admin', 'superadmin']} />}>
            <Route path="/proktor" element={page(ProctorDashboardPage)} />
            <Route path="/proktor/sesi" element={page(ProctorSessionsPage)} />
            <Route path="/proktor/sesi/:sessionId" element={page(ProctorSessionPage)} />
            <Route path="/proktor/laporan" element={page(ProctorReportsPage)} />
          </Route>

          <Route element={<RequireAuth roles={['student']} />}>
            <Route path="/siswa" element={page(StudentHomePage)} />
            <Route path="/siswa/hasil" element={page(StudentResultsPage)} />
            <Route path="/siswa/hasil/:attemptId" element={page(ResultDetailPage)} />
            <Route path="/siswa/ujian/:attemptId" element={page(ExamPlayerPage)} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
