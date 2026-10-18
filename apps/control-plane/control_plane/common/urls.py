from django.urls import path

from .views import DatePresetsView, DateRangeView, OptionsView

urlpatterns = [
    path("date-presets/", DatePresetsView.as_view(), name="date-presets"),
    path("date-range/", DateRangeView.as_view(), name="date-range"),
    path("options/", OptionsView.as_view(), name="options"),
]
