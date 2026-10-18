"""
Auth endpoints (JWT). The refresh token lives in an httpOnly cookie (never exposed
to JS); the short-lived access token is returned in the body for the SPA to hold in
memory and send as `Authorization: Bearer`.
"""
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import LoginSerializer, PlatformUserSerializer

User = get_user_model()

REFRESH_COOKIE = "refresh_token"
COOKIE_PATH = "/api/auth"


def _set_refresh_cookie(response: Response, refresh: RefreshToken) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path=COOKIE_PATH,
    )


@extend_schema(tags=["Authentication"])
class LoginView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=LoginSerializer, responses=PlatformUserSerializer)
    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=s.validated_data["email"],
            password=s.validated_data["password"],
        )
        if user is None or not user.is_active:
            return Response({"detail": "Invalid email or password."}, status=status.HTTP_401_UNAUTHORIZED)
        refresh = RefreshToken.for_user(user)
        resp = Response({"access": str(refresh.access_token), "user": PlatformUserSerializer(user).data})
        _set_refresh_cookie(resp, refresh)
        return resp


@extend_schema(tags=["Authentication"])
class RefreshView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=None,
        responses=inline_serializer(
            name="AccessTokenResponse", fields={"access": drf_serializers.CharField()}
        ),
    )
    def post(self, request):
        raw = request.COOKIES.get(REFRESH_COOKIE)
        if not raw:
            return Response({"detail": "No refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            refresh = RefreshToken(raw)
        except TokenError:
            return Response({"detail": "Invalid or expired refresh token."}, status=status.HTTP_401_UNAUTHORIZED)

        resp = Response({"access": str(refresh.access_token)})

        if settings.SIMPLE_JWT.get("ROTATE_REFRESH_TOKENS"):
            try:
                refresh.blacklist()
            except Exception:
                pass  # blacklist app may not track this token; rotation still proceeds
            user_id = refresh.get("user_id")
            try:
                user = User.objects.get(pk=user_id)
                new_refresh = RefreshToken.for_user(user)
                resp.data["access"] = str(new_refresh.access_token)
                _set_refresh_cookie(resp, new_refresh)
            except User.DoesNotExist:
                pass
        return resp


@extend_schema(tags=["Authentication"])
class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={205: None})
    def post(self, request):
        raw = request.COOKIES.get(REFRESH_COOKIE)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except Exception:
                pass
        resp = Response(status=status.HTTP_205_RESET_CONTENT)
        resp.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
        return resp


@extend_schema(tags=["Authentication"])
class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PlatformUserSerializer)
    def get(self, request):
        return Response(PlatformUserSerializer(request.user).data)
