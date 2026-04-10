# Generated manually on 2026-04-10

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenants', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ------------------------------------------------------------------
        # meetings_meeting
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name='Meeting',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=300)),
                ('scheduled_at', models.DateTimeField()),
                ('status', models.CharField(
                    choices=[
                        ('DRAFT', 'Draft'),
                        ('SCHEDULED', 'Scheduled'),
                        ('IN_PROGRESS', 'In Progress'),
                        ('COMPLETED', 'Completed'),
                        ('CANCELLED', 'Cancelled'),
                    ],
                    default='DRAFT',
                    db_index=True,
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='created_meetings',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('site', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='meetings',
                    to='tenants.site',
                )),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='meetings',
                    to='tenants.tenant',
                )),
            ],
            options={
                'db_table': 'meetings_meeting',
                'ordering': ['-scheduled_at'],
            },
        ),

        # ------------------------------------------------------------------
        # meetings_agendaitem
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name='AgendaItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=300)),
                ('description', models.TextField(blank=True, default='', max_length=2000)),
                ('sort_order', models.IntegerField(default=0)),
                ('attachment_path', models.CharField(blank=True, max_length=500, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('meeting', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='agenda_items',
                    to='meetings.meeting',
                )),
                ('submitted_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='submitted_agenda_items',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'meetings_agendaitem',
                'ordering': ['sort_order', 'created_at'],
            },
        ),

        # ------------------------------------------------------------------
        # meetings_attendance
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name='MeetingAttendance',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('method', models.CharField(
                    choices=[
                        ('IN_PERSON', 'In Person'),
                        ('MATERIAL_ONLY', 'Material Only'),
                    ],
                    max_length=20,
                )),
                ('signed_at', models.DateTimeField(auto_now_add=True)),
                ('meeting', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='attendances',
                    to='meetings.meeting',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='meeting_attendances',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'meetings_attendance',
            },
        ),
        migrations.AlterUniqueTogether(
            name='meetingattendance',
            unique_together={('meeting', 'user')},
        ),

        # ------------------------------------------------------------------
        # meetings_minute
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name='MeetingMinute',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('content', models.TextField(blank=True, default='', max_length=50000)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('meeting', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='minutes',
                    to='meetings.meeting',
                )),
                ('updated_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='updated_minutes',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'meetings_minute',
            },
        ),

        # ------------------------------------------------------------------
        # meetings_resolution
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name='Resolution',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('text', models.TextField()),
                ('status', models.CharField(
                    choices=[
                        ('OPEN', 'Open'),
                        ('IN_PROGRESS', 'In Progress'),
                        ('COMPLETED', 'Completed'),
                        ('CANCELLED', 'Cancelled'),
                    ],
                    default='OPEN',
                    db_index=True,
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('agenda_item', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='resolutions',
                    to='meetings.agendaitem',
                )),
                ('meeting', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='resolutions',
                    to='meetings.meeting',
                )),
            ],
            options={
                'db_table': 'meetings_resolution',
            },
        ),

        # ------------------------------------------------------------------
        # meetings_task
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name='Task',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=300)),
                ('due_date', models.DateField()),
                ('status', models.CharField(
                    choices=[
                        ('TODO', 'To Do'),
                        ('IN_PROGRESS', 'In Progress'),
                        ('DONE', 'Done'),
                        ('OVERDUE', 'Overdue'),
                        ('CANCELLED', 'Cancelled'),
                    ],
                    default='TODO',
                    db_index=True,
                    max_length=20,
                )),
                ('progress_notes', models.TextField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('delivery_type', models.CharField(
                    blank=True,
                    choices=[
                        ('PICKUP', 'Pick Up'),
                        ('DROP', 'Drop Off'),
                    ],
                    max_length=10,
                    null=True,
                )),
                ('pickup_location', models.CharField(blank=True, max_length=500, null=True)),
                ('drop_location', models.CharField(blank=True, max_length=500, null=True)),
                ('confirmed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assignee', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='assigned_tasks',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('resolution', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='tasks',
                    to='meetings.resolution',
                )),
            ],
            options={
                'db_table': 'meetings_task',
            },
        ),
    ]
