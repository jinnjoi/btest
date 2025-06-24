from django import forms
from .models import Block, Discipline, Competence
from unfold.widgets import (
    UnfoldAdminTextInputWidget,
    UnfoldAdminCheckboxSelectMultiple,
    UnfoldAdminTextareaWidget,
)

class ImportForm(forms.Form):
    import_file = forms.FileField(label='Выберите файл для импорта')

class SmartTestForm(forms.Form):
    name = forms.CharField(
        label="Название теста", 
        max_length=255,
        widget=UnfoldAdminTextInputWidget()
    )
    blocks = forms.ModelMultipleChoiceField(
        queryset=Block.objects.all(),
        widget=UnfoldAdminCheckboxSelectMultiple(),
        label="Блоки вопросов",
        required=False
    )
    disciplines = forms.ModelMultipleChoiceField(
        queryset=Discipline.objects.all(),
        widget=UnfoldAdminCheckboxSelectMultiple(),
        label="Дисциплины",
        required=False
    )
    competences = forms.ModelMultipleChoiceField(
        queryset=Competence.objects.all(),
        widget=UnfoldAdminCheckboxSelectMultiple(),
        label="Компетенции",
        required=False
    )
    num_questions = forms.IntegerField(
        label="Количество вопросов в тесте",
        min_value=1,
        widget=UnfoldAdminTextInputWidget(attrs={'type': 'number'})
    )
    timer = forms.IntegerField(
        label="Таймер (минуты)",
        min_value=1,
        initial=30,
        widget=UnfoldAdminTextInputWidget(attrs={'type': 'number'})
    )
    description = forms.CharField(
        label="Описание (необязательно)",
        widget=UnfoldAdminTextareaWidget(),
        required=False
    ) 